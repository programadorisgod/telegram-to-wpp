import { Telegraf } from "telegraf";
import type { TelegramConfig } from "../types";

// ── Mime type constants ─────────────────────────
const MIME_WEBP = "image/webp";
const MIME_WEBM = "video/webm";
const MIME_MP4 = "video/mp4";

type ReplyInfo = { text: string; fromName: string; isFromBot?: boolean };

type IncomingMediaHandler = (
  base64: string,
  mimetype: string,
  caption: string | undefined,
  fromName: string,
  fileName?: string,
  isSticker?: boolean,
  replyTo?: ReplyInfo,
) => void;

// ── Telegram entity → HTML conversion ────────────

interface Entity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: { id: number };
}

/** Map a Telegram entity type to its HTML tag pair. Returns null for non-formatting entities. */
function getEntityTag(entity: Entity): [string, string] | null {
  switch (entity.type) {
    case "bold":
      return ["<b>", "</b>"];
    case "italic":
      return ["<i>", "</i>"];
    case "underline":
      return ["<u>", "</u>"];
    case "strikethrough":
      return ["<s>", "</s>"];
    case "spoiler":
      return ["<tg-spoiler>", "</tg-spoiler>"];
    case "code":
      return ["<code>", "</code>"];
    case "pre":
      return ["<pre>", "</pre>"];
    case "text_link": {
      const url = entity.url ? entity.url.replace(/&/g, "&amp;").replace(/"/g, "&quot;") : "#";
      return [`<a href="${url}">`, "</a>"];
    }
    case "text_mention":
      return [`<a href="tg://user?id=${entity.user?.id ?? 0}">`, "</a>"];
    default:
      return null;
  }
}

/**
 * Convert Telegram message text + entities → HTML suitable for parse_mode: "HTML".
 * Text segments are individually escaped so that literal `<`, `>`, `&` are safe.
 */
function entitiesToHtml(text: string, entities: Entity[] | undefined): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  if (!entities || entities.length === 0) {
    return escapeHtml(text);
  }

  // Collect open/close events at each character position
  const opens: Map<number, string[]> = new Map();
  const closes: Map<number, string[]> = new Map();

  for (const entity of entities) {
    const tag = getEntityTag(entity);
    if (!tag) continue;
    const [openTag, closeTag] = tag;

    if (!opens.has(entity.offset)) opens.set(entity.offset, []);
    opens.get(entity.offset)!.push(openTag);

    const end = entity.offset + entity.length;
    if (!closes.has(end)) closes.set(end, []);
    closes.get(end)!.push(closeTag);
  }

  const positions = new Set<number>([...opens.keys(), ...closes.keys()]);
  const sortedPositions = [...positions].sort((a, b) => a - b);

  let result = "";
  let pos = 0;

  for (const evtPos of sortedPositions) {
    if (evtPos > pos) {
      result += escapeHtml(text.slice(pos, evtPos));
    }

    // Close inner tags before opening outer tags at the same position
    if (closes.has(evtPos)) result += closes.get(evtPos)!.join("");
    if (opens.has(evtPos)) result += opens.get(evtPos)!.join("");

    pos = evtPos;
  }

  if (pos < text.length) {
    result += escapeHtml(text.slice(pos));
  }

  return result;
}

/** Map a media message object to a fallback text label (used when replying to a captionless media). */
function getMediaFallbackText(msg: Record<string, unknown>): string | null {
  if ("photo" in msg) return "📷";
  if ("video" in msg) return "🎥";
  if ("audio" in msg) return "🎵";
  if ("voice" in msg) return "🎵";
  if ("document" in msg) return "📄";
  if ("sticker" in msg) return "🎨";
  if ("animation" in msg) return "🎬";
  if ("video_note" in msg) return "🎥";
  return null;
}

/**
 * Extract plain text + formatting entities from any message-like object
 * (handles both text messages with `entities` and media messages with `caption_entities`).
 */
function messageTextAndEntities(
  msg: Record<string, unknown>,
): { text: string; entities: Entity[] | undefined } {
  if ("text" in msg && typeof msg.text === "string") {
    return { text: msg.text, entities: msg.entities as Entity[] | undefined };
  }
  if ("caption" in msg && typeof msg.caption === "string") {
    return { text: msg.caption, entities: msg.caption_entities as Entity[] | undefined };
  }
  return { text: "", entities: undefined };
}

export class TelegramClient {
  private bot: Telegraf;
  private incomingMediaHandler: IncomingMediaHandler | null = null;

  constructor(private config: TelegramConfig) {
    this.bot = new Telegraf(config.botToken);
  }

  setOnMessageCallback(callback: (text: string, fromName: string, replyTo?: ReplyInfo) => void): void {
    this.config.onMessage = callback;
  }

  setOnMediaCallback(callback: IncomingMediaHandler): void {
    this.incomingMediaHandler = callback;
  }

  start(): void {
    this.bot.on("message", async (ctx) => {
      if (!ctx.message || !ctx.from) return;

      // Filter messages from the bot itself
      if (ctx.botInfo && ctx.from.id === ctx.botInfo.id) return;

      const fromName = ctx.from.first_name || ctx.from.username || "Unknown";

      // ── Convert caption with entities when present ──
      const msgCtx = ctx.message as any;
      const captionEntities = msgCtx.caption_entities as Entity[] | undefined;
      const msgCaption = typeof msgCtx.caption === "string"
        ? entitiesToHtml(msgCtx.caption, captionEntities)
        : undefined;

      // ── Common reply detection (applies to all message types) ──
      let replyTo: ReplyInfo | undefined;
      const rawReply = (ctx.message as any).reply_to_message;
      if (rawReply) {
        const { text: replyText, entities: replyEntities } = messageTextAndEntities(rawReply);
        const replyFromName =
          rawReply.from?.first_name || rawReply.from?.username || "Unknown";
        const replyFromId = rawReply.from?.id;
        const isFromBot = ctx.botInfo ? replyFromId === ctx.botInfo.id : false;

        if (replyText) {
          replyTo = {
            text: entitiesToHtml(replyText, replyEntities),
            fromName: replyFromName,
            isFromBot,
          };
        } else {
          // Media message without caption — use a fallback media type label
          const mediaLabel = getMediaFallbackText(rawReply);
          if (mediaLabel) {
            replyTo = {
              text: mediaLabel,
              fromName: replyFromName,
              isFromBot,
            };
          }
        }
      }

      // ── Photo detection ─────────────────────────────
      if ("photo" in ctx.message) {
        const photos = ctx.message.photo;
        if (photos && photos.length > 0) {
          const largest = photos[photos.length - 1];
          await this.handleIncomingFile(
            largest.file_id,
            "image/jpeg",
            msgCaption,
            fromName,
            undefined,
            undefined,
            replyTo,
          );
          return;
        }
      }

      // ── Audio detection ─────────────────────────────
      if ("audio" in ctx.message && ctx.message.audio) {
        await this.handleIncomingFile(
          ctx.message.audio.file_id,
          ctx.message.audio.mime_type ?? "audio/ogg",
          msgCaption,
          fromName,
          undefined,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Voice detection (voice messages/notes) ──────
      if ("voice" in ctx.message && ctx.message.voice) {
        const mime = ctx.message.voice.mime_type ?? "audio/ogg";
        await this.handleIncomingFile(
          ctx.message.voice.file_id,
          mime,
          undefined,
          fromName,
          undefined,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Video detection ─────────────────────────────
      if ("video" in ctx.message && ctx.message.video) {
        await this.handleIncomingFile(
          ctx.message.video.file_id,
          ctx.message.video.mime_type ?? "video/mp4",
          msgCaption,
          fromName,
          undefined,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Sticker detection ───────────────────────────
      if ("sticker" in ctx.message && ctx.message.sticker) {
        const sticker = ctx.message.sticker;

        // Video stickers (webm)
        if (sticker.is_video) {
          await this.handleIncomingFile(
            sticker.file_id,
            MIME_WEBM,
            undefined,
            fromName,
            undefined,
            true,
            replyTo,
          );
          return;
        }

        // Animated stickers (Lottie .tgs) — WhatsApp can't render them
        if (sticker.is_animated) {
          console.warn("[TG] Animated sticker from", fromName, "— not supported, sending notification");
          if (this.config.onMessage) {
            this.config.onMessage("🎨 sent an animated sticker (not supported)", fromName, undefined);
          }
          return;
        }

        // Static stickers (webp) — send as sticker
        await this.handleIncomingFile(
          sticker.file_id,
          MIME_WEBP,
          undefined,
          fromName,
          undefined,
          true,
          replyTo,
        );
        return;
      }

      // ── Video note (circular video) detection ───────
      if ("video_note" in ctx.message && ctx.message.video_note) {
        await this.handleIncomingFile(
          ctx.message.video_note.file_id,
          MIME_MP4,
          undefined,
          fromName,
          undefined,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Animation (GIF) detection ──────────────────
      if ("animation" in ctx.message && ctx.message.animation) {
        const mime = ctx.message.animation.mime_type ?? MIME_MP4;
        await this.handleIncomingFile(
          ctx.message.animation.file_id,
          mime,
          msgCaption,
          fromName,
          undefined,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Document detection (any file type) ──
      if ("document" in ctx.message && ctx.message.document) {
        const doc = ctx.message.document;
        const mime = doc.mime_type ?? "application/octet-stream";
        const fileName = doc.file_name ?? "document";
        await this.handleIncomingFile(
          doc.file_id,
          mime,
          msgCaption,
          fromName,
          fileName,
          undefined,
          replyTo,
        );
        return;
      }

      // ── Text only ───────────────────────────────────
      const text = "text" in ctx.message ? ctx.message.text ?? "" : "";
      if (!text) {
        console.warn(
          "[TG] Unhandled message type from",
          fromName,
          "— keys:",
          Object.keys(ctx.message).join(", "),
        );
        return;
      }

      const entities = msgCtx.entities as Entity[] | undefined;
      const htmlText = entitiesToHtml(text, entities);

      if (this.config.onMessage) {
        this.config.onMessage(htmlText, fromName, replyTo);
      }
    });

    this.bot.launch();
  }

  private async handleIncomingFile(
    fileId: string,
    mimetype: string,
    caption: string | undefined,
    fromName: string,
    fileName?: string,
    isSticker?: boolean,
    replyTo?: ReplyInfo,
  ): Promise<void> {
    try {
      const link = await this.bot.telegram.getFileLink(fileId);
      const response = await fetch(link.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString("base64");

      if (this.incomingMediaHandler) {
        this.incomingMediaHandler(base64, mimetype, caption, fromName, fileName, isSticker, replyTo);
      }
    } catch (err) {
      console.error("[TG MEDIA] Error downloading incoming media:", err);
    }
  }

  stop(): void {
    this.bot.stop();
  }

  async sendMessage(text: string, chatId?: number): Promise<void> {
    await this.bot.telegram.sendMessage(
      chatId ?? this.config.groupId,
      text,
      { parse_mode: "HTML" },
    );
  }

  async sendPhoto(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    const buffer = Buffer.from(base64, "base64");
    await this.bot.telegram.sendPhoto(
      chatId,
      { source: buffer },
      caption ? { caption, parse_mode: "HTML" } : undefined,
    );
  }

  async sendAudio(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    const buffer = Buffer.from(base64, "base64");
    await this.bot.telegram.sendAudio(
      chatId,
      { source: buffer },
      caption ? { caption, parse_mode: "HTML" } : undefined,
    );
  }

  async sendVideo(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    const buffer = Buffer.from(base64, "base64");
    await this.bot.telegram.sendVideo(
      chatId,
      { source: buffer },
      caption ? { caption, parse_mode: "HTML" } : undefined,
    );
  }

  async sendSticker(chatId: number, base64: string): Promise<void> {
    const buffer = Buffer.from(base64, "base64");
    await this.bot.telegram.sendSticker(
      chatId,
      { source: buffer },
    );
  }

  async sendDocument(
    chatId: number,
    base64: string,
    caption?: string,
    fileName?: string,
  ): Promise<void> {
    const buffer = Buffer.from(base64, "base64");
    await this.bot.telegram.sendDocument(
      chatId,
      { source: buffer, filename: fileName },
      caption ? { caption, parse_mode: "HTML" } : undefined,
    );
  }
}
