import { IWhatsAppService, type IContactSearchResult } from "../ports/IWhatsAppService.js";
import type { ReplyContext } from "../ports/IMessageHandler.js";

export class WhatsAppService implements IWhatsAppService {
    private sender: string | null = null;
    private messageHandler:
        | ((to: string, message: string) => Promise<string | null>)
        | null = null;
    private editHandler:
        | ((to: string, messageId: string, newContent: string) => Promise<void>)
        | null = null;
    private mediaHandler:
        | ((to: string, base64: string, mimetype: string, caption?: string, fileName?: string, isSticker?: boolean) => Promise<string | null>)
        | null = null;
    private mediaUrlHandler:
        | ((to: string, url: string, caption?: string, headers?: Record<string, string>) => Promise<string | null>)
        | null = null;
    private incomingMediaHandler:
        | ((base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean) => Promise<void>)
        | null = null;
    private searchHandler: ((query: string) => Promise<IContactSearchResult[]>) | null = null;

    setSenderNumber(number: string): void {
        this.sender = number;
    }

    setMessageSender(
        handler: (to: string, message: string) => Promise<string | null>,
    ): void {
        this.messageHandler = handler;
    }

    setEditMessageSender(
        handler: (
            to: string,
            messageId: string,
            newContent: string,
        ) => Promise<void>,
    ): void {
        this.editHandler = handler;
    }

    setMediaSender(
        handler: (to: string, base64: string, mimetype: string, caption?: string, fileName?: string, isSticker?: boolean) => Promise<string | null>,
    ): void {
        this.mediaHandler = handler;
    }

    setMediaUrlSender(
        handler: (to: string, url: string, caption?: string, headers?: Record<string, string>) => Promise<string | null>,
    ): void {
        this.mediaUrlHandler = handler;
    }

    setContactSearchHandler(handler: (query: string) => Promise<IContactSearchResult[]>): void {
        this.searchHandler = handler;
    }

    setIncomingMediaHandler(
        handler: (base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: ReplyContext) => Promise<void>,
    ): void {
        this.incomingMediaHandler = handler;
    }

    getIncomingMediaHandler():
        | ((base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: ReplyContext) => Promise<void>)
        | null {
        return this.incomingMediaHandler;
    }

    async sendMedia(
        to: string,
        base64: string,
        mimetype: string,
        caption?: string,
        fileName?: string,
        isSticker?: boolean,
    ): Promise<string | null> {
        if (this.mediaHandler) {
            return await this.mediaHandler(to, base64, mimetype, caption, fileName, isSticker);
        }
        console.log(`[WHATSAPP MEDIA] To: ${to} type=${mimetype} caption="${caption ?? ""}"`);
        return null;
    }

    async sendMessage(to: string, message: string): Promise<string | null> {
        if (this.messageHandler) {
            return await this.messageHandler(to, message);
        }
        console.log(`[WHATSAPP] To: ${to}\n${message}`);
        return null;
    }

    async sendMenu(to: string, menuText: string): Promise<string | null> {
        return this.sendMessage(to, menuText);
    }

    async editMessage(
        to: string,
        messageId: string,
        newContent: string,
    ): Promise<boolean> {
        if (this.editHandler) {
            await this.editHandler(to, messageId, newContent);
            return true;
        }
        return false;
    }

    async sendMediaFromUrl(
        to: string,
        url: string,
        caption?: string,
        headers?: Record<string, string>,
    ): Promise<string | null> {
        if (this.mediaUrlHandler) {
            return await this.mediaUrlHandler(to, url, caption, headers);
        }
        console.log(`[WHATSAPP MEDIA URL] To: ${to} url=${url} caption="${caption ?? ""}"`);
        return null;
    }

    async searchContacts(query: string): Promise<IContactSearchResult[]> {
        if (!this.searchHandler) return [];
        return this.searchHandler(query);
    }
}
