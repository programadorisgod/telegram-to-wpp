import { Client, LocalAuth, MessageMedia, type Message } from "whatsapp-web.js";
import { join } from "path";
import { unlinkSync } from "fs";
import QRCode from "qrcode";
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

export class BaileysClient {
    private client: Client | null = null;
    private messageHandler: IMessageHandler | null = null;
    private onConnectedCallback: ((number: string) => void) | null = null;
    private connectedNumber: string | null = null;

    // TTL-based caches (replaces unbounded Set/Map with manual trimming)
    private processedMessageIds: SimpleTTLCache<string, true>;
    private recentBodies: SimpleTTLCache<string, number>;
    private sentMessages: SimpleTTLCache<string, Message>;
    private recentSends: SimpleTTLCache<string, number>;

    private readonly DEDUP_WINDOW_MS = 500;
    private readonly SEND_DEDUP_WINDOW_MS = 2000;

    /** Current QR as a base64 data URL (null once connected) */
    private qrDataUrl: string | null = null;
    private authError: string | null = null;

    private contactsCache: IContactSearchResult[] | null = null;
    private contactsCacheTimestamp: number | null = null;
    private readonly contactsCacheTtlMs: number;

    /** Concurrency limiter for message handlers — prevents Puppeteer saturation. */
    private readonly globalLimiter: ReturnType<typeof pLimit>;

    /** Per-sender serialization queues to prevent race conditions on state transitions. */
    private readonly senderQueues: SimpleTTLCache<string, ReturnType<typeof pLimit>>;

    /** Callback for incoming media messages (photos, audio, video, stickers) */
    private incomingMediaHandler:
        | ((base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: ReplyContext) => Promise<void>)
        | null = null;

    constructor(private config: WhatsAppConfig) {
        const ttl = config.cacheTtlMs ?? 300_000; // 5 min default
        const max = config.cacheMaxSize ?? 200;
        this.processedMessageIds = new SimpleTTLCache(ttl, max);
        this.recentBodies = new SimpleTTLCache(ttl, max);
        this.sentMessages = new SimpleTTLCache(ttl, max);
        this.recentSends = new SimpleTTLCache(ttl, max);
        this.senderQueues = new SimpleTTLCache(ttl, max);
        this.contactsCacheTtlMs = config.contactsCacheTtlMs ?? 300_000;
        this.globalLimiter = pLimit(config.concurrency ?? 3);
    }

    /**
     * Remove stale Chrome lock files from the session directory.
     * Prevents "The profile appears to be in use by another Chromium process" errors
     * after container restarts or abrupt stops.
     */
    private cleanStaleLocks(): void {
        const sessionDir = join(
            process.cwd(),
            this.config.sessionPath,
            "session",
        );
        const lockFiles = [
            "SingletonLock",
            "SingletonCookie",
            "SingletonSocket",
            "DevToolsActivePort",
        ];

        for (const file of lockFiles) {
            const filePath = join(sessionDir, file);
            try {
                unlinkSync(filePath);
                console.log(`[CLEAN] Removed stale lock: ${file}`);
            } catch {
                // file doesn't exist or can't be removed — best-effort
            }
        }
    }

    /** Return the current QR / connection status for the /scan page */
    getQrStatus(): QrStatus {
        if (this.connectedNumber) {
            return {
                status: "connected",
                qr: null,
                number: this.connectedNumber,
            };
        }
        if (this.authError) {
            return { status: "error", qr: null, number: null };
        }
        return { status: "waiting", qr: this.qrDataUrl, number: null };
    }

    async initialize(maxRetries = 3): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.tryInitialize();
                return;
            } catch (err: any) {
                if (
                    attempt < maxRetries &&
                    err?.message?.includes("Execution context was destroyed")
                ) {
                    const delay = Math.min(1000 * attempt, 3000);
                    console.warn(
                        `[INIT_RETRY] attempt ${attempt}/${maxRetries} — context destroyed, retrying in ${delay}ms`,
                    );
                    await this.client?.destroy().catch(() => {});
                    this.client = null;
                    this.qrDataUrl = null;
                    this.authError = null;
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                throw err;
            }
        }
    }

    /** Single attempt at initializing the WhatsApp client. */
    private async tryInitialize(): Promise<void> {
        this.cleanStaleLocks();

        const sessionPath = join(process.cwd(), this.config.sessionPath);

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: sessionPath,
            }),
            puppeteer: {
                headless: true,
                executablePath: this.config.chromePath,
                args: [
                    "--headless=new",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-zygote",
                    "--single-process",
                    "--disable-extensions",
                    "--disable-software-rasterizer",
                ],
            },
        });

        this.client.on("qr", (qr) => {
            this.authError = null;

            // Terminal output
            console.log("\n╔═══════════════════════════════════════╗");
            console.log("║   📱 ESCANEA EL QR CON WHATSAPP 📱   ║");
            console.log("║   WhatsApp > Ajustes > Dispositivos  ║");
            console.log("╚═══════════════════════════════════════╝\n");

            import("qrcode-terminal").then(({ default: qrcode }) => {
                qrcode.generate(qr, { small: true });
                console.log("\n⏳ Esperando autenticación...\n");
            });

            // Data URL for the /scan web page
            QRCode.toDataURL(qr, { width: 300, margin: 2 })
                .then((url) => {
                    this.qrDataUrl = url;
                })
                .catch((err) => {
                    console.error("[QR] Failed to generate data URL:", err);
                });
        });

        this.client.on("ready", () => {
            console.log("\n✅ ¡Conectado a WhatsApp!\n");
            this.qrDataUrl = null; // QR no longer needed
            const info = this.client?.info;
            if (info) {
                this.connectedNumber = info.wid.user;
                if (this.onConnectedCallback) {
                    this.onConnectedCallback(info.wid.user);
                }
            }
        });

        this.client.on("authenticated", () => {
            console.log("🔐 Autenticado correctamente");
        });

        this.client.on("auth_failure", (msg) => {
            console.error("\n❌ Error de autenticación:", msg);
            this.authError =
                typeof msg === "string" ? msg : "Error de autenticación";
        });

        this.client.on("disconnected", (reason) => {
            console.log("\n⚠️ Desconectado:", reason);
        });

        this.client.on("message", (message: Message) => {
            // Per-sender serialization: each sender gets a FIFO queue (concurrency=1)
            // so their messages process sequentially. The global limiter caps total
            // concurrent handlers across all senders.
            let queue = this.senderQueues.get(message.from);
            if (!queue) {
                queue = pLimit(1);
                this.senderQueues.set(message.from, queue);
            }
            this.globalLimiter(() => queue(() => this.handleIncomingMessage(message)));
        });

        await this.client.initialize();
    }

    /**
     * Process a single incoming message through the concurrency limiter.
     * Contains all the dedup, media download, and routing logic.
     */
    private async handleIncomingMessage(message: Message): Promise<void> {
        if (message.fromMe) return;

        const isGroup = message.from.includes("@g.us");
        const isChannel = message.from.includes("@broadcast");

        if (isGroup || isChannel) {
            console.log(`[IGNORED] Grupo/Canal: ${message.from}`);
            return;
        }

        const msgId = message.id?.id || message.id?._serialized;
        if (msgId && this.processedMessageIds.has(msgId)) {
            console.log(`[DUPLICATE] Skip message ${msgId}`);
            return;
        }

        const body = (message.body || "").trim();
        
        // ── Media-only message (photo, audio, video, document) ──
        if (!body && message.hasMedia) {
            console.log(`[MEDIA] Detected ${message.type} from ${message.from}`);

            let replyContext: ReplyContext | undefined;
            if (message.hasQuotedMsg) {
                try {
                    const quoted = await message.getQuotedMessage();
                    replyContext = {
                        text: quoted.body || this.mediaFallbackText(quoted),
                        from: quoted.from,
                    };
                } catch (err) {
                    console.error(`[REPLY] Failed to get quoted message:`, err);
                }
            }

            try {
                const media = await message.downloadMedia();
                if (media && this.incomingMediaHandler) {
                    const fileName = media.filename || this.guessFileName(media.mimetype);
                    const duration = (message as any).duration ?? 0;
                    const isSticker = message.type === "sticker";
                    const imageCaption = (message as any).caption;
                    await this.incomingMediaHandler(
                        media.data,
                        media.mimetype,
                        message.from,
                        imageCaption || this.mediaFallbackText(message),
                        fileName,
                        duration,
                        isSticker,
                        replyContext,
                    );
                }
            } catch (err) {
                console.error(`[MEDIA] Failed to download from ${message.from}:`, err);
            }
            return;
        }

        if (!body) {
            console.log(
                `[EMPTY] Skip empty body message ${msgId || "unknown"}`,
            );
            return;
        }

        // Track processed message ID (TTL cache auto-evicts)
        if (msgId) {
            this.processedMessageIds.set(msgId, true);
        }

        // ── Content-based dedup: same sender + same body in short window ──
        const contentKey = `${message.from}::${body}`;
        const lastSeen = this.recentBodies.get(contentKey);
        const now = Date.now();
        if (lastSeen && now - lastSeen < this.DEDUP_WINDOW_MS) {
            console.log(
                `[CONTENT_DUP] Skip ${message.from} body="${body.slice(0, 50)}" (${now - lastSeen}ms ago)`,
            );
            return;
        }
        this.recentBodies.set(contentKey, now);

        // ── Media + text (caption) ──────────────────────────
        if (message.hasMedia && body) {
            console.log(`[MEDIA] ${message.type} with caption from ${message.from}`);

            let replyContext: ReplyContext | undefined;
            if (message.hasQuotedMsg) {
                try {
                    const quoted = await message.getQuotedMessage();
                    replyContext = {
                        text: quoted.body || this.mediaFallbackText(quoted),
                        from: quoted.from,
                    };
                } catch (err) {
                    console.error(`[REPLY] Failed to get quoted message:`, err);
                }
            }

            try {
                const media = await message.downloadMedia();
                if (media && this.incomingMediaHandler) {
                    const fileName = media.filename || this.guessFileName(media.mimetype);
                    const duration = (message as any).duration ?? 0;
                    await this.incomingMediaHandler(
                        media.data,
                        media.mimetype,
                        message.from,
                        body,
                        fileName,
                        duration,
                        undefined,
                        replyContext,
                    );
                }
            } catch (err) {
                console.error(`[MEDIA] Failed to download from ${message.from}:`, err);
            }
            return;
        }

        // ── Reply detection ──────────────────────────────
        let replyContext: ReplyContext | undefined;
        if (message.hasQuotedMsg) {
            try {
                const quoted = await message.getQuotedMessage();
                replyContext = {
                    text: quoted.body || this.mediaFallbackText(quoted),
                    from: quoted.from,
                };
            } catch (err) {
                console.error(`[REPLY] Failed to get quoted message:`, err);
            }
        }

        console.log(`[MESSAGE] De: ${message.from} - ${message.body}`);

        if (this.messageHandler) {
            const text = message.body;
            await this.messageHandler.handle(text, message.from, replyContext);
        }
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

    /** Map Message type to a fallback text (used when replying to a captionless media message). */
    private mediaFallbackText(message: Message): string {
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
        const icon = iconMap[message.type] || "📎";
        return `${icon}`;
    }

    /** Generate a fallback filename from MIME type */
    private guessFileName(mimetype: string): string {
        const ext = mimetype.split("/")[1]?.split(";")[0]?.trim() || "bin";
        return `media.${ext}`;
    }

    /**
     * Outgoing content dedup: same recipient + same body within SEND_DEDUP_WINDOW_MS.
     * whatsapp-web.js can internally fire the CDP send command multiple times
     * for a single sendMessage call, causing duplicate messages in the chat.
     */

    async sendMessage(to: string, message: string): Promise<string | null> {
        if (!this.client) throw new Error("WhatsApp no conectado");

        // ── Outgoing dedup ────────────────────────────────────
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

        const msg = await this.sendWithRetry(
            () => this.client!.sendMessage(to, message),
            `text to=${to}`,
        );
        const msgId = msg?.id?._serialized ?? null;

        console.log(
            `[SEND] to=${to} id=${msgId} text="${message.slice(0, 50)}..."`,
        );

        if (msgId) {
            this.sentMessages.set(msgId, msg);
        }
        return msgId;
    }

    async editMessage(
        _to: string,
        messageId: string,
        content: string,
    ): Promise<boolean> {
        const msg = this.sentMessages.get(messageId);
        if (!msg) {
            console.warn(`[EDIT] Message ${messageId} not found in cache`);
            return false;
        }
        console.log(
            `[EDIT] id=${messageId} newText="${content.slice(0, 50)}..."`,
        );
        try {
            const result = await msg.edit(content);
            const ok = result !== null;
            console.log(
                `[EDIT] result=`,
                ok ? "ok" : "null (edit rejected by WhatsApp)",
            );
            return ok;
        } catch (err) {
            console.error(`[EDIT] error:`, err);
            return false;
        }
    }

    /**
     * Wrap this.client.sendMessage with retry logic for navigation-related
     * Puppeteer context destruction errors.
     */
    private async sendWithRetry<T>(sendFn: () => Promise<T>, label: string): Promise<T> {
        let attempt = 1;
        const maxAttempts = 3;
        while (true) {
            try {
                return await sendFn();
            } catch (err: any) {
                if (
                    attempt < maxAttempts &&
                    err?.message?.includes("Execution context was destroyed")
                ) {
                    const delay = Math.min(1000 * attempt, 3000);
                    console.warn(
                        `[RETRY] ${label} attempt ${attempt}/${maxAttempts} — context destroyed, retrying in ${delay}ms`,
                    );
                    await new Promise((r) => setTimeout(r, delay));
                    attempt++;
                    continue;
                }
                throw err;
            }
        }
    }

    async sendMedia(
        to: string,
        base64: string,
        mimetype: string,
        caption?: string,
        fileName?: string,
        isSticker?: boolean,
    ): Promise<string | null> {
        if (!this.client) throw new Error("WhatsApp no conectado");

        const media = new MessageMedia(mimetype, base64, fileName);
        const options: any = { caption };

        if (isSticker) {
            try {
                options.sendMediaAsSticker = true;
                const msg = await this.sendWithRetry(
                    () => this.client!.sendMessage(to, media, options),
                    `sticker to=${to}`,
                );
                const msgId = msg?.id?._serialized ?? null;
                console.log(
                    `[SEND MEDIA] to=${to} id=${msgId} type=${mimetype} sticker=✓ caption="${(caption ?? "").slice(0, 50)}"`,
                );
                if (msgId) {
                    this.sentMessages.set(msgId, msg);
                }
                return msgId;
            } catch (err: any) {
                console.warn(`[SEND MEDIA] Sticker failed for ${mimetype}, falling back to regular media:`, err.message || err);
                delete options.sendMediaAsSticker;
            }
        }

        const msg = await this.sendWithRetry(
            () => this.client!.sendMessage(to, media, options),
            `media to=${to}`,
        );
        const msgId = msg?.id?._serialized ?? null;

        console.log(
            `[SEND MEDIA] to=${to} id=${msgId} type=${mimetype} caption="${(caption ?? "").slice(0, 50)}"`,
        );

        if (msgId) {
            this.sentMessages.set(msgId, msg);
        }
        return msgId;
    }

    async sendMediaFromUrl(
        to: string,
        url: string,
        caption?: string,
        headers?: Record<string, string>,
        maxSizeBytes?: number,
    ): Promise<string | null> {
        if (!this.client) throw new Error("WhatsApp no conectado");

        // Check Content-Length before downloading to reject large files early
        const headRes = await fetch(url, {
            method: "HEAD",
            headers: Object.keys(headers ?? {}).length > 0 ? headers : undefined,
        });
        if (!headRes.ok) {
            throw new Error(`Failed to fetch media headers: ${headRes.status} ${headRes.statusText}`);
        }

        const contentLength = headRes.headers.get("content-length");
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            const limit = maxSizeBytes ?? 10 * 1024 * 1024; // 10MB default
            if (size > limit) {
                throw new Error(`Media file too large (${(size / 1024 / 1024).toFixed(1)}MB, max ${(limit / 1024 / 1024).toFixed(0)}MB)`);
            }
        }

        // Download with streaming
        const response = await fetch(url, {
            headers: Object.keys(headers ?? {}).length > 0 ? headers : undefined,
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        // Collect stream to buffer (whatsapp-web.js requires base64)
        const chunks: Uint8Array[] = [];
        const reader = response.body?.getReader();
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
        } else {
            // Fallback for environments without ReadableStream
            const arrayBuffer = await response.arrayBuffer();
            chunks.push(new Uint8Array(arrayBuffer));
        }

        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const buffer = Buffer.concat(chunks, totalLength);
        const base64 = buffer.toString("base64");
        const mimetype = response.headers.get("content-type") || "image/jpeg";

        const media = new MessageMedia(mimetype, base64);
        const msg = await this.sendWithRetry(
            () => this.client!.sendMessage(to, media, { caption }),
            `media-url to=${to}`,
        );
        const msgId = msg?.id?._serialized ?? null;

        console.log(
            `[SEND MEDIA URL] to=${to} id=${msgId} url=${url.slice(0, 80)} caption="${(caption ?? "").slice(0, 50)}"`,
        );

        if (msgId) {
            this.sentMessages.set(msgId, msg);
        }
        return msgId;
    }

    async getContacts(): Promise<IContactSearchResult[]> {
        if (!this.client) throw new Error("WhatsApp no conectado");

        // Invalidate cache if TTL expired
        const now = Date.now();
        if (
            this.contactsCache &&
            this.contactsCacheTimestamp &&
            now - this.contactsCacheTimestamp < this.contactsCacheTtlMs
        ) {
            return this.contactsCache;
        }

        const raw = await this.client.getContacts();
        this.contactsCache = raw
            .filter(c => c.isMyContact || c.isWAContact)
            .map(c => ({
                id: c.id._serialized,
                name: c.name || c.pushname || "—",
                number: c.number || "",
                pushname: c.pushname,
            }));
        this.contactsCacheTimestamp = now;
        return this.contactsCache;
    }

    async searchContacts(query: string): Promise<IContactSearchResult[]> {
        const all = await this.getContacts();
        const raw = query.trim();
        if (!raw) return [];
        // Normalize accents: "pedaltín" → "pedaltin" so it matches any "Pedaltin"
        const normalize = (s: string) =>
            s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const q = normalize(raw);

        // 1. Fast pass: substring match (accent-insensitive)
        let results = all.filter(c =>
            normalize(c.name).includes(q) ||
            c.number.includes(raw) ||
            (c.pushname && normalize(c.pushname).includes(q)),
        );

        // 2. Fuzzy pass: if no substring matches, try Levenshtein distance
        // so "pedaltín" → "Peraltín", "manuelin" → "manuel" / "manuelito", etc.
        // Compares against the full name and each individual word, so
        // "Manuel Alejandro" is checked as "manuelalejandro", "manuel", "alejandro"
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

    getConnectedNumber(): string | null {
        return this.connectedNumber;
    }

    isConnected(): boolean {
        return this.client?.info !== undefined;
    }

    async logout(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
        }
    }
}

/** Levenshtein edit distance — used for fuzzy contact search. */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    // Use a single row optimization for space
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
