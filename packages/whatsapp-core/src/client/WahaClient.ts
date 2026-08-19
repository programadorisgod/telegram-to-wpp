import WebSocket from "ws";
import pLimit from "p-limit";
import type { IMessageHandler, ReplyContext } from "../ports/IMessageHandler.js";
import type { WhatsAppConfig } from "../types.js";
import type { IContactSearchResult } from "../ports/IWhatsAppService.js";
import { SimpleTTLCache } from "../utils/SimpleTTLCache.js";

export interface QrStatus {
    status: "waiting" | "connected" | "error";
    qr: string | null;
    number: string | null;
}

interface WahaMessagePayload {
    id: { id: string; _serialized: string };
    from: string;
    to: string;
    body: string;
    type: string;
    timestamp: number;
    fromMe: boolean;
    hasMedia: boolean;
    hasQuotedMsg: boolean;
    caption?: string;
    duration?: number;
    media?: { mimetype: string; url: string; filename?: string };
    _data?: Record<string, unknown>;
}

interface WahaSessionStatus {
    name: string;
    status: string;
    engine?: { engine: string };
    me?: { id: string; pushName: string };
}

interface WahaContact {
    id: string;
    name?: string;
    pushname?: string;
    number?: string;
    isMyContact?: boolean;
    isWAContact?: boolean;
}

export class WahaClient {
    private baseUrl: string;
    private apiKey: string;
    private sessionName: string;

    private messageHandler: IMessageHandler | null = null;
    private onConnectedCallback: ((number: string) => void) | null = null;
    private connectedNumber: string | null = null;

    private processedMessageIds: SimpleTTLCache<string, true>;
    private recentBodies: SimpleTTLCache<string, number>;
    private recentSends: SimpleTTLCache<string, number>;
    private sentMessages: SimpleTTLCache<string, string>;

    private readonly DEDUP_WINDOW_MS = 500;
    private readonly SEND_DEDUP_WINDOW_MS = 2000;

    private qrDataUrl: string | null = null;
    private authError: string | null = null;
    private sessionStatus: string = "STOPPED";

    private contactsCache: IContactSearchResult[] | null = null;
    private contactsCacheTimestamp: number | null = null;
    private readonly contactsCacheTtlMs: number;

    private readonly globalLimiter: ReturnType<typeof pLimit>;
    private readonly senderQueues: SimpleTTLCache<string, ReturnType<typeof pLimit>>;

    private incomingMediaHandler:
        | ((base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: ReplyContext) => Promise<void>)
        | null = null;

    private ws: WebSocket | null = null;
    private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private wsReconnectDelay = 1000;
    private readonly WS_MAX_RECONNECT_DELAY = 30000;
    private wsPingTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private config: WhatsAppConfig) {
        this.baseUrl = config.wahaBaseUrl.replace(/\/+$/, "");
        this.apiKey = config.wahaApiKey;
        this.sessionName = config.sessionName ?? "default";

        const ttl = config.cacheTtlMs ?? 300_000;
        const max = config.cacheMaxSize ?? 200;
        this.processedMessageIds = new SimpleTTLCache(ttl, max);
        this.recentBodies = new SimpleTTLCache(ttl, max);
        this.recentSends = new SimpleTTLCache(ttl, max);
        this.sentMessages = new SimpleTTLCache(ttl, max);
        this.senderQueues = new SimpleTTLCache(ttl, max);
        this.contactsCacheTtlMs = config.contactsCacheTtlMs ?? 300_000;
        this.globalLimiter = pLimit(config.concurrency ?? 3);
    }

    private get apiHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "X-Api-Key": this.apiKey,
        };
    }

    getQrStatus(): QrStatus {
        if (this.connectedNumber) {
            return { status: "connected", qr: null, number: this.connectedNumber };
        }
        if (this.authError) {
            return { status: "error", qr: null, number: null };
        }
        return { status: "waiting", qr: this.qrDataUrl, number: null };
    }

    async initialize(): Promise<void> {
        console.log(`[WAHA] Connecting to ${this.baseUrl} session="${this.sessionName}"`);

        await this.ensureSession();
        await this.connectWebSocket();
    }

    private async ensureSession(): Promise<void> {
        try {
            const res = await fetch(
                `${this.baseUrl}/api/sessions/${this.sessionName}`,
                { headers: this.apiHeaders },
            );

            if (res.status === 404) {
                console.log("[WAHA] Session not found, creating...");
                const createRes = await fetch(`${this.baseUrl}/api/sessions`, {
                    method: "POST",
                    headers: this.apiHeaders,
                    body: JSON.stringify({
                        name: this.sessionName,
                        start: true,
                        config: {
                            gows: {
                                storage: {
                                    messages: true,
                                    groups: true,
                                    chats: true,
                                    labels: true,
                                    contacts: true,
                                    messageSecrets: true,
                                },
                            },
                        },
                    }),
                });
                if (!createRes.ok) {
                    const text = await createRes.text();
                    throw new Error(`Failed to create session: ${createRes.status} ${text}`);
                }
                console.log("[WAHA] Session created and starting...");
            } else if (res.ok) {
                const session: WahaSessionStatus = await res.json();
                this.sessionStatus = session.status;
                console.log(`[WAHA] Session status: ${session.status}`);

                if (session.status === "WORKING" && session.me) {
                    this.connectedNumber = session.me.id.replace(/@.*/, "");
                }

                if (session.status !== "WORKING" && session.status !== "SCAN_QR_CODE") {
                    console.log("[WAHA] Starting session...");
                    await fetch(
                        `${this.baseUrl}/api/sessions/${this.sessionName}/start`,
                        { method: "POST", headers: this.apiHeaders },
                    );
                }
            } else {
                const text = await res.text();
                throw new Error(`Failed to get session: ${res.status} ${text}`);
            }
        } catch (err) {
            console.error("[WAHA] ensureSession error:", err);
            throw err;
        }
    }

    private async connectWebSocket(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/ws?x-api-key=${encodeURIComponent(this.apiKey)}&session=${encodeURIComponent(this.sessionName)}&events=*`;

        console.log(`[WAHA] WebSocket connecting to ${this.baseUrl}/ws`);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.on("open", () => {
                console.log("[WAHA] WebSocket connected");
                this.wsReconnectDelay = 1000;

                this.wsPingTimer = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.ping();
                    }
                }, 30_000);
            });

            this.ws.on("message", (data: Buffer) => {
                try {
                    const parsed = JSON.parse(data.toString());
                    this.handleWebSocketEvent(parsed);
                } catch (err) {
                    console.error("[WAHA] WebSocket parse error:", err);
                }
            });

            this.ws.on("close", (code: number, reason: Buffer) => {
                console.log(`[WAHA] WebSocket closed: code=${code} reason=${reason.toString()}`);
                this.clearWsPingTimer();
                this.scheduleReconnect();
            });

            this.ws.on("error", (err: Error) => {
                console.error("[WAHA] WebSocket error:", err.message);
            });
        } catch (err) {
            console.error("[WAHA] WebSocket connection failed:", err);
            this.scheduleReconnect();
        }
    }

    private clearWsPingTimer(): void {
        if (this.wsPingTimer) {
            clearInterval(this.wsPingTimer);
            this.wsPingTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.wsReconnectTimer) return;

        const delay = this.wsReconnectDelay;
        console.log(`[WAHA] Reconnecting in ${delay}ms...`);
        this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            this.wsReconnectDelay = Math.min(delay * 2, this.WS_MAX_RECONNECT_DELAY);
            this.connectWebSocket();
        }, delay);
    }

    private handleWebSocketEvent(data: { event: string; session: string; payload: unknown }): void {
        const { event, payload } = data;

        switch (event) {
            case "session.status":
                this.handleSessionStatus(payload as WahaSessionStatus);
                break;
            case "message":
                this.handleIncomingWahaMessage(payload as WahaMessagePayload);
                break;
        }
    }

    private handleSessionStatus(status: WahaSessionStatus): void {
        const prevStatus = this.sessionStatus;
        this.sessionStatus = status.status;
        console.log(`[WAHA] Session status: ${prevStatus} → ${status.status}`);

        if (status.status === "WORKING") {
            this.qrDataUrl = null;
            this.authError = null;

            if (status.me) {
                const number = status.me.id.replace(/@.*/, "");
                this.connectedNumber = number;
                console.log(`[WAHA] Connected: ${number} (${status.me.pushName})`);
                if (this.onConnectedCallback) {
                    this.onConnectedCallback(number);
                }
            }
        } else if (status.status === "SCAN_QR_CODE") {
            this.connectedNumber = null;
            this.qrDataUrl = "pending";
            this.fetchQrCode();
        } else if (status.status === "FAILED") {
            this.authError = "Session failed";
            this.connectedNumber = null;
        } else if (status.status === "STOPPED" || status.status === "STARTING") {
            this.connectedNumber = null;
        }
    }

    private async fetchQrCode(): Promise<void> {
        try {
            const res = await fetch(
                `${this.baseUrl}/api/${this.sessionName}/auth/qr?format=raw`,
                { headers: this.apiHeaders },
            );
            if (res.ok) {
                const data = await res.json() as { qr?: string };
                if (data.qr) {
                    this.qrDataUrl = `data:image/png;base64,${data.qr}`;
                }
            }
        } catch (err) {
            console.error("[WAHA] Failed to fetch QR:", err);
        }
    }

    private async handleIncomingWahaMessage(msg: WahaMessagePayload): Promise<void> {
        if (msg.fromMe) return;

        const isGroup = msg.from?.includes("@g.us") ?? false;
        const isChannel = msg.from?.includes("@broadcast") ?? false;
        if (isGroup || isChannel) {
            console.log(`[IGNORED] Grupo/Canal: ${msg.from}`);
            return;
        }

        const msgId = msg.id?.id || msg.id?._serialized;
        if (msgId && this.processedMessageIds.has(msgId)) {
            console.log(`[DUPLICATE] Skip message ${msgId}`);
            return;
        }

        const body = (msg.body || "").trim();

        if (!body && msg.hasMedia) {
            console.log(`[MEDIA] Detected ${msg.type} from ${msg.from}`);
            if (msgId) {
                this.processedMessageIds.set(msgId, true);
            }
            await this.processMediaMessage(msg);
            return;
        }

        if (!body) {
            console.log(`[EMPTY] Skip empty body message ${msgId || "unknown"}`);
            return;
        }

        if (msgId) {
            this.processedMessageIds.set(msgId, true);
        }

        const contentKey = `${msg.from}::${body}`;
        const lastSeen = this.recentBodies.get(contentKey);
        const now = Date.now();
        if (lastSeen && now - lastSeen < this.DEDUP_WINDOW_MS) {
            console.log(
                `[CONTENT_DUP] Skip ${msg.from} body="${body.slice(0, 50)}" (${now - lastSeen}ms ago)`,
            );
            return;
        }
        this.recentBodies.set(contentKey, now);

        if (msg.hasMedia && body) {
            console.log(`[MEDIA] ${msg.type} with caption from ${msg.from}`);
            await this.processMediaMessage(msg, body);
            return;
        }

        let replyContext: ReplyContext | undefined;
        if (msg.hasQuotedMsg && msg._data) {
            replyContext = this.extractReplyContext(msg);
        }

        console.log(`[MESSAGE] De: ${msg.from} - ${msg.body}`);

        let queue = this.senderQueues.get(msg.from);
        if (!queue) {
            queue = pLimit(1);
            this.senderQueues.set(msg.from, queue);
        }
        this.globalLimiter(() =>
            queue!(() => this.messageHandler?.handle(body, msg.from, replyContext)),
        );
    }

    private extractReplyContext(msg: WahaMessagePayload): ReplyContext | undefined {
        try {
            const quoted = (msg._data as Record<string, unknown>)?.quotedMessage as
                | { body?: string; from?: string }
                | undefined;
            if (quoted) {
                return {
                    text: quoted.body || this.mediaFallbackText("text"),
                    from: quoted.from,
                };
            }
        } catch {
            // ignore
        }
        return undefined;
    }

    private async processMediaMessage(msg: WahaMessagePayload, caption?: string): Promise<void> {
        let replyContext: ReplyContext | undefined;
        if (msg.hasQuotedMsg) {
            replyContext = this.extractReplyContext(msg);
        }

        try {
            if (msg.media?.url) {
                const mediaUrl = msg.media.url.startsWith("http")
                    ? msg.media.url
                    : `${this.baseUrl}${msg.media.url}`;
                const fetchUrl = mediaUrl.includes("?")
                    ? `${mediaUrl}&x-api-key=${encodeURIComponent(this.apiKey)}`
                    : `${mediaUrl}?x-api-key=${encodeURIComponent(this.apiKey)}`;

                const res = await fetch(fetchUrl);
                if (!res.ok) throw new Error(`Media download failed: ${res.status}`);

                const buffer = Buffer.from(await res.arrayBuffer());
                const base64 = buffer.toString("base64");
                const mimetype = msg.media.mimetype || msg.type || "application/octet-stream";
                const fileName = msg.media.filename || this.guessFileName(mimetype);
                const duration = msg.duration ?? 0;
                const isSticker = msg.type === "sticker";

                if (this.incomingMediaHandler) {
                    await this.incomingMediaHandler(
                        base64,
                        mimetype,
                        msg.from,
                        caption || msg.caption || this.mediaFallbackText(msg.type),
                        fileName,
                        duration,
                        isSticker,
                        replyContext,
                    );
                }
            } else {
                console.warn(`[MEDIA] No media URL in message from ${msg.from}`);
            }
        } catch (err) {
            console.error(`[MEDIA] Failed to download from ${msg.from}:`, err);
        }
    }

    private mediaFallbackText(type: string): string {
        const iconMap: Record<string, string> = {
            image: "📷",
            video: "🎥",
            audio: "🎵",
            voice: "🎵",
            sticker: "🎨",
            document: "📄",
            gif: "🎬",
            ptt: "🎵",
            vcard: "👤",
            location: "📍",
        };
        return iconMap[type] || "📎";
    }

    private guessFileName(mimetype: string): string {
        const ext = mimetype.split("/")[1]?.split(";")[0]?.trim() || "bin";
        return `media.${ext}`;
    }

    setMessageHandler(handler: IMessageHandler): void {
        this.messageHandler = handler;
    }

    setOnConnectedCallback(callback: (number: string) => void): void {
        this.onConnectedCallback = callback;
    }

    setIncomingMediaHandler(
        handler: (base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: ReplyContext) => Promise<void>,
    ): void {
        this.incomingMediaHandler = handler;
    }

    // ── REST API: Send Text ──────────────────────────────

    async sendMessage(to: string, message: string): Promise<string | null> {
        const sendKey = `${to}::${message}`;
        const lastSend = this.recentSends.get(sendKey);
        const now = Date.now();
        if (lastSend && now - lastSend < this.SEND_DEDUP_WINDOW_MS) {
            console.log(
                `[SEND_DUP] Skip duplicate send to=${to} text="${message.slice(0, 50)}" (${now - lastSend}ms ago)`,
            );
            return null;
        }
        this.recentSends.set(sendKey, now);

        const res = await fetch(`${this.baseUrl}/api/sendText`, {
            method: "POST",
            headers: this.apiHeaders,
            body: JSON.stringify({
                session: this.sessionName,
                chatId: to,
                text: message,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`[SEND] Error ${res.status}: ${text}`);
            return null;
        }

        const data = await res.json() as { key?: { id?: string }; id?: string };
        const msgId = data?.key?.id ?? data?.id ?? null;

        console.log(`[SEND] to=${to} id=${msgId} text="${message.slice(0, 50)}..."`);

        if (msgId) {
            this.sentMessages.set(msgId, msgId);
        }
        return msgId;
    }

    // ── REST API: Edit Message ───────────────────────────

    async editMessage(to: string, messageId: string, content: string): Promise<boolean> {
        console.log(`[EDIT] id=${messageId} newText="${content.slice(0, 50)}..."`);

        try {
            const res = await fetch(
                `${this.baseUrl}/api/${this.sessionName}/chats/${to}/messages/${messageId}`,
                {
                    method: "PUT",
                    headers: this.apiHeaders,
                    body: JSON.stringify({ text: content }),
                },
            );
            const ok = res.ok;
            console.log(`[EDIT] result=${ok ? "ok" : `error ${res.status}`}`);
            return ok;
        } catch (err) {
            console.error(`[EDIT] error:`, err);
            return false;
        }
    }

    // ── REST API: Send Media ─────────────────────────────

    async sendMedia(
        to: string,
        base64: string,
        mimetype: string,
        caption?: string,
        fileName?: string,
        isSticker?: boolean,
    ): Promise<string | null> {
        const filePayload = {
            mimetype,
            data: base64,
            filename: fileName || this.guessFileName(mimetype),
        };

        let endpoint = "/api/sendFile";
        if (mimetype.startsWith("image/")) endpoint = "/api/sendImage";
        else if (mimetype.startsWith("video/")) endpoint = "/api/sendVideo";
        else if (mimetype.startsWith("audio/")) endpoint = "/api/sendVoice";

        const body: Record<string, unknown> = {
            session: this.sessionName,
            chatId: to,
            file: filePayload,
        };

        if (caption && endpoint !== "/api/sendVoice") {
            body.caption = caption;
        }

        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: this.apiHeaders,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`[SEND MEDIA] Error ${res.status}: ${text}`);
            return null;
        }

        const data = await res.json() as { key?: { id?: string }; id?: string };
        const msgId = data?.key?.id ?? data?.id ?? null;

        console.log(
            `[SEND MEDIA] to=${to} id=${msgId} type=${mimetype} sticker=${isSticker ? "✓" : "no"} caption="${(caption ?? "").slice(0, 50)}"`,
        );

        if (msgId) {
            this.sentMessages.set(msgId, msgId);
        }
        return msgId;
    }

    // ── REST API: Send Media From URL ────────────────────

    async sendMediaFromUrl(
        to: string,
        url: string,
        caption?: string,
        _headers?: Record<string, string>,
        maxSizeBytes?: number,
    ): Promise<string | null> {
        const headRes = await fetch(url, { method: "HEAD" });
        if (!headRes.ok) {
            throw new Error(`Failed to fetch media headers: ${headRes.status} ${headRes.statusText}`);
        }

        const contentLength = headRes.headers.get("content-length");
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            const limit = maxSizeBytes ?? 10 * 1024 * 1024;
            if (size > limit) {
                throw new Error(`Media file too large (${(size / 1024 / 1024).toFixed(1)}MB, max ${(limit / 1024 / 1024).toFixed(0)}MB)`);
            }
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimetype = response.headers.get("content-type") || "image/jpeg";

        const filePayload = {
            mimetype,
            url,
        };

        let endpoint = "/api/sendFile";
        if (mimetype.startsWith("image/")) endpoint = "/api/sendImage";
        else if (mimetype.startsWith("video/")) endpoint = "/api/sendVideo";
        else if (mimetype.startsWith("audio/")) endpoint = "/api/sendVoice";

        const body: Record<string, unknown> = {
            session: this.sessionName,
            chatId: to,
            file: filePayload,
        };

        if (caption && endpoint !== "/api/sendVoice") {
            body.caption = caption;
        }

        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: this.apiHeaders,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`[SEND MEDIA URL] Error ${res.status}: ${text}`);
            return null;
        }

        const data = await res.json() as { key?: { id?: string }; id?: string };
        const msgId = data?.key?.id ?? data?.id ?? null;

        console.log(
            `[SEND MEDIA URL] to=${to} id=${msgId} url=${url.slice(0, 80)} caption="${(caption ?? "").slice(0, 50)}"`,
        );

        if (msgId) {
            this.sentMessages.set(msgId, msgId);
        }
        return msgId;
    }

    // ── REST API: Contacts ───────────────────────────────

    async getContacts(): Promise<IContactSearchResult[]> {
        const now = Date.now();
        if (
            this.contactsCache &&
            this.contactsCacheTimestamp &&
            now - this.contactsCacheTimestamp < this.contactsCacheTtlMs
        ) {
            return this.contactsCache;
        }

        const allContacts: IContactSearchResult[] = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const res = await fetch(
                `${this.baseUrl}/api/contacts/all?session=${this.sessionName}&limit=${limit}&offset=${offset}&sortBy=id&sortOrder=asc`,
                { headers: this.apiHeaders },
            );

            if (!res.ok) {
                console.error(`[CONTACTS] Error fetching contacts: ${res.status}`);
                break;
            }

            const contacts: WahaContact[] = await res.json();
            if (contacts.length === 0) {
                hasMore = false;
                break;
            }

            for (const c of contacts) {
                if (c.isMyContact || c.isWAContact) {
                    allContacts.push({
                        id: c.id,
                        name: c.name || c.pushname || "—",
                        number: c.number || "",
                        pushname: c.pushname,
                    });
                }
            }

            if (contacts.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        this.contactsCache = allContacts;
        this.contactsCacheTimestamp = now;
        return this.contactsCache;
    }

    async searchContacts(query: string): Promise<IContactSearchResult[]> {
        const all = await this.getContacts();
        const raw = query.trim();
        if (!raw) return [];

        const normalize = (s: string) =>
            s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const q = normalize(raw);

        let results = all.filter(c =>
            normalize(c.name).includes(q) ||
            c.number.includes(raw) ||
            (c.pushname && normalize(c.pushname).includes(q)),
        );

        if (results.length === 0 && q.length >= 3) {
            const threshold = Math.max(2, Math.floor(q.length * 0.4));
            results = all.filter(c => {
                const name = normalize(c.name);
                const words = name.split(/\s+/);
                const pushname = c.pushname ? normalize(c.pushname) : "";
                const pushWords = pushname ? pushname.split(/\s+/) : [];
                return words.some(w => levenshtein(w, q) <= threshold)
                    || (pushname && pushWords.some(w => levenshtein(w, q) <= threshold));
            });
        }

        return results.slice(0, 10);
    }

    // ── Status ───────────────────────────────────────────

    getConnectedNumber(): string | null {
        return this.connectedNumber;
    }

    isConnected(): boolean {
        return this.sessionStatus === "WORKING";
    }

    getSessionStatus(): string {
        return this.sessionStatus;
    }

    async logout(): Promise<void> {
        this.clearWsPingTimer();
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        try {
            await fetch(
                `${this.baseUrl}/api/sessions/${this.sessionName}/logout`,
                { method: "POST", headers: this.apiHeaders },
            );
        } catch {
            // best effort
        }
    }
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const temp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = temp;
        }
    }
    return dp[n];
}
