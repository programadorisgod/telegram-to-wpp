import { ITelegramService } from "../ports/ITelegramService";
import { TelegramClient } from "../client/TelegramClient";

export class BridgeTelegramService implements ITelegramService {
  constructor(private client: TelegramClient) {}

  async sendMessage(text: string, chatId?: number): Promise<void> {
    await this.client.sendMessage(text, chatId);
  }

  async sendPhoto(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    await this.client.sendPhoto(chatId, base64, caption);
  }

  async sendAudio(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    await this.client.sendAudio(chatId, base64, caption);
  }

  async sendVideo(
    chatId: number,
    base64: string,
    caption?: string,
  ): Promise<void> {
    await this.client.sendVideo(chatId, base64, caption);
  }

  async sendSticker(chatId: number, base64: string): Promise<void> {
    await this.client.sendSticker(chatId, base64);
  }

  async sendDocument(
    chatId: number,
    base64: string,
    caption?: string,
    fileName?: string,
  ): Promise<void> {
    await this.client.sendDocument(chatId, base64, caption, fileName);
  }
}
