export interface ITelegramService {
  sendMessage(text: string, chatId?: number): Promise<void>;

  /** Send a photo to the Telegram group */
  sendPhoto(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void>;

  /** Send an audio file to the Telegram group */
  sendAudio(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void>;

  /** Send a video to the Telegram group */
  sendVideo(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void>;

  /** Send a sticker (WebP) to the Telegram group */
  sendSticker(chatId: number, base64: string): Promise<void>;

  /** Send a document/file to the Telegram group (zip, pdf, doc, etc.) */
  sendDocument(
    chatId: number,
    base64: string,
    caption?: string,
    fileName?: string,
  ): Promise<void>;
}
