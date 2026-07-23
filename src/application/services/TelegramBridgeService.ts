import { IWhatsAppService } from "@task-bot/whatsapp-core";
import { ITelegramService } from "@task-bot/telegram-core";
import { getUserName } from "../../infrastructure/config/userMapping.js";
import { env } from "../../infrastructure/config/env.js";
import { htmlToWppMarkdown, wppMarkdownToHtml } from "./MarkdownConverter.js";

export class TelegramBridgeService {
  /** sender → last activity timestamp */
  private activeSessions: Map<string, number> = new Map();
  private readonly sessionTtlMs: number;

  constructor(
    private whatsappService: IWhatsAppService,
    private telegramService: ITelegramService,
    private groupId: number,
  ) {
    this.sessionTtlMs = env.TTL_CACHE_SESSIONS; // 15 min default
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  isActive(sender: string): boolean {
    this.cleanupZombies();
    return this.activeSessions.has(sender);
  }

  enterBridge(sender: string): void {
    this.activeSessions.set(sender, Date.now());
  }

  exitBridge(sender: string): void {
    this.activeSessions.delete(sender);
  }

  /** Touch session timestamp to prevent zombie cleanup */
  private touchSession(sender: string): void {
    this.activeSessions.set(sender, Date.now());
  }

  /** Remove sessions that have been inactive for longer than TTL */
  private cleanupZombies(): void {
    const now = Date.now();
    for (const [sender, lastActive] of this.activeSessions.entries()) {
      if (now - lastActive > this.sessionTtlMs) {
        this.activeSessions.delete(sender);
      }
    }
  }

  /**
   * Clean quoted text that contains nested bridge-formatted chains
   * (legacy format with 👤 and separators).
   */
  private cleanQuotedText(text: string): string {
    const solidSep = "\n━━━━━━━━━━━━━━━━━━━━━\n";
    const dottedSep = "\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n";

    const parts = text.split(solidSep);
    if (parts.length > 1) {
      const lastContent = parts[parts.length - 1].trim();
      const beforeLast = parts.slice(0, -1).join(solidSep);
      const senderMatch = beforeLast.match(/👤 ([^\n┄━━]+)/);
      if (senderMatch) {
        const sender = senderMatch[1].trim();
        return `👤 ${sender}: ${lastContent}`;
      }
      return lastContent;
    }

    const dottedIdx = text.indexOf(dottedSep);
    if (dottedIdx !== -1) {
      const afterDotted = text.slice(dottedIdx + dottedSep.length).trim();
      if (afterDotted.includes(solidSep) || afterDotted.includes(dottedSep)) {
        return this.cleanQuotedText(afterDotted);
      }
      return afterDotted;
    }

    return text;
  }

  /**
   * Extrae el mensaje real de un texto citado que pueda contener
   * una respuesta anidada. Maneja el formato legacy (separadores con 👤)
   * y el actual (dos líneas "Nombre: texto\nNombre: texto").
   */
  private cleanReplyText(text: string): string {
    const cleaned = this.cleanQuotedText(text);

    const newlineIdx = cleaned.indexOf("\n");
    if (newlineIdx !== -1) {
      const firstLine = cleaned.slice(0, newlineIdx).trim();
      const rest = cleaned.slice(newlineIdx + 1).trim();
      const stripped = firstLine.replace(/^>\s*/, "");
      // Match "*Name1:* msg1" and "*Name2:* msg2" (optional * between : and space)
      if (/^[^:]+:\*? /.test(stripped) && /^[^:]+:\*? /.test(rest)) {
        return rest;
      }
    }

    return cleaned;
  }

  async sendToTelegram(
    sender: string,
    text: string,
    replyTo?: { text: string; from?: string },
  ): Promise<void> {
    const userName = this.escapeHtml(getUserName(sender));
    const convertedText = wppMarkdownToHtml(this.escapeHtml(text));
    let msg: string;
    if (replyTo) {
      let quoted = this.cleanReplyText(replyTo.text);
      let replyAuthor = getUserName(replyTo.from ?? "");

      const truncated = quoted.length > 45 ? quoted.slice(0, 43) + "…" : quoted;
      const cleanQuoted = wppMarkdownToHtml(this.escapeHtml(truncated));
      const replyName = this.escapeHtml(replyAuthor);
      msg =
        replyAuthor === replyTo.from
          ? `<blockquote>${cleanQuoted}</blockquote>\n<b>${userName}:</b> ${convertedText}`
          : `<blockquote><b>${replyName}:</b> ${cleanQuoted}</blockquote>\n<b>${userName}:</b> ${convertedText}`;
    } else {
      msg = `<b>${userName}:</b> ${convertedText}`;
    }
    await this.telegramService.sendMessage(msg, this.groupId);
  }

  async sendToWhatsApp(
    text: string,
    fromName: string,
    replyTo?: { text: string; fromName: string; isFromBot?: boolean },
  ): Promise<void> {
    if (this.activeSessions.size === 0) return;

    const cleanedText = htmlToWppMarkdown(text);

    let msg: string;
    if (replyTo) {
      const quoted = this.cleanReplyText(htmlToWppMarkdown(replyTo.text));
      const truncated = quoted.length > 45 ? quoted.slice(0, 43) + "…" : quoted;
      msg = replyTo.isFromBot
        ? `> ${truncated}\n*${fromName}:* ${cleanedText}`
        : `> *${replyTo.fromName}:* ${truncated}\n*${fromName}:* ${cleanedText}`;
    } else {
      msg = `*${fromName}:* ${cleanedText}`;
    }

    const promises: Promise<void>[] = [];

    for (const session of this.activeSessions.keys()) {
      this.touchSession(session); // prevent zombie cleanup
      promises.push(
        this.whatsappService.sendMessage(session, msg).then(() => {}),
      );
    }

    await Promise.all(promises);
  }

  // ── Media: WhatsApp → Telegram ────────────────────────────
  async sendMediaToTelegram(
    sender: string,
    base64: string,
    mimetype: string,
    caption?: string,
    fileName?: string,
    isSticker?: boolean,
    replyContext?: { text: string; from?: string },
  ): Promise<void> {
    const userName = this.escapeHtml(getUserName(sender));

    const userLine = caption
      ? `<b>${userName}:</b> ${wppMarkdownToHtml(this.escapeHtml(caption))}`
      : `<b>${userName}:</b> Message`;

    let captionWithUser: string;
    if (replyContext) {
      const quoted = this.cleanReplyText(replyContext.text);
      const replyAuthor = getUserName(replyContext.from ?? "");
      const truncated = quoted.length > 45 ? quoted.slice(0, 43) + "…" : quoted;
      const cleanQuoted = wppMarkdownToHtml(this.escapeHtml(truncated));
      const replyName = this.escapeHtml(replyAuthor);
      captionWithUser =
        replyAuthor === replyContext.from
          ? `<blockquote>${cleanQuoted}</blockquote>\n${userLine}`
          : `<blockquote><b>${replyName}:</b> ${cleanQuoted}</blockquote>\n${userLine}`;
    } else {
      captionWithUser = userLine;
    }

    if (isSticker) {
      await this.telegramService.sendSticker(this.groupId, base64);
    } else if (mimetype.startsWith("image/")) {
      await this.telegramService.sendPhoto(
        this.groupId,
        base64,
        captionWithUser,
      );
    } else if (mimetype.startsWith("video/")) {
      await this.telegramService.sendVideo(
        this.groupId,
        base64,
        captionWithUser,
      );
    } else if (mimetype.startsWith("audio/")) {
      await this.telegramService.sendAudio(
        this.groupId,
        base64,
        captionWithUser,
      );
    } else {
      await this.telegramService.sendDocument(
        this.groupId,
        base64,
        captionWithUser,
        fileName,
      );
    }
  }

  // ── Media: Telegram → WhatsApp ────────────────────────────
  async sendMediaToWhatsApp(
    base64: string,
    mimetype: string,
    caption: string | undefined,
    fromName: string,
    fileName?: string,
    isSticker?: boolean,
    replyTo?: { text: string; fromName: string; isFromBot?: boolean },
  ): Promise<void> {
    if (this.activeSessions.size === 0) return;

    // Pick icon based on mimetype
    const icon = isSticker
      ? "🎨"
      : mimetype.startsWith("image/")
        ? "📷"
        : mimetype.startsWith("video/")
          ? "🎥"
          : mimetype.startsWith("audio/")
            ? "🎵"
            : "📄";

    const cleanedCaption = caption ? htmlToWppMarkdown(caption) : undefined;

    let captionWithUser: string;
    if (replyTo) {
      const replyLine = replyTo.isFromBot
        ? htmlToWppMarkdown(replyTo.text) // si es del bot, pasarlo por el metodo cleanReplyText
        : `*${replyTo.fromName}*: ${htmlToWppMarkdown(replyTo.text)}`;
      const truncatedReply =
        replyLine.length > 45 ? replyLine.slice(0, 43) + "…" : replyLine;
      const currentLine = cleanedCaption
        ? `*${fromName}:* ${cleanedCaption}`
        : `*${fromName}:* ${icon}`;
      captionWithUser = `> ${truncatedReply}\n${currentLine}`;
    } else {
      captionWithUser = cleanedCaption
        ? `*${fromName}:* ${cleanedCaption}`
        : `*${fromName}:* ${icon}`;
    }

    const promises: Promise<void>[] = [];

    for (const session of this.activeSessions.keys()) {
      this.touchSession(session); // prevent zombie cleanup
      promises.push(
        this.whatsappService
          .sendMedia(
            session,
            base64,
            mimetype,
            captionWithUser,
            fileName,
            isSticker,
          )
          .then(() => {}),
      );
    }

    await Promise.all(promises);
  }

  getActiveCount(): number {
    return this.activeSessions.size;
  }
}
