export interface IContactSearchResult {
  id: string;
  name: string;
  number: string;
  pushname?: string;
}

export interface IWhatsAppService {
  sendMessage(to: string, message: string): Promise<string | null>;
  sendMenu(to: string, menuText: string): Promise<string | null>;
  editMessage(to: string, messageId: string, newContent: string): Promise<boolean>;

  /** Send a media file (photo/audio/video/document/sticker) to a WhatsApp user */
  sendMedia(
    to: string,
    base64: string,
    mimetype: string,
    caption?: string,
    fileName?: string,
    isSticker?: boolean,
  ): Promise<string | null>;

  /** Send media from a public URL (avoids base64/puppeteer size limits) */
  sendMediaFromUrl(
    to: string,
    url: string,
    caption?: string,
    headers?: Record<string, string>,
  ): Promise<string | null>;

  /** Buscar contactos de WhatsApp por nombre/número */
  searchContacts(query: string): Promise<IContactSearchResult[]>;
}
