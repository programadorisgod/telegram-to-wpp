import { BotFeature } from "../BotFeature.js";
import { IWhatsAppService } from "@task-bot/whatsapp-core";
import { ConversationStateMachine } from "../../ConversationStateMachine.js";
import { TelegramBridgeService } from "../../../../application/services/TelegramBridgeService.js";

export class BridgeFeature implements BotFeature {
  readonly name = "telegram";

  constructor(
    private whatsappService: IWhatsAppService,
    private stateMachine: ConversationStateMachine,
    private telegramBridgeService: TelegramBridgeService,
    private authorizedIds: Set<string>,
  ) {}

  isAvailableFor(sender: string): boolean {
    return this.authorizedIds.has(sender);
  }

  getMenuEntries(): string[] {
    return ["Chat Telegram"];
  }

  getSubmenuMenu(): string {
    return [
      "📱 *Chat con Telegram*",
      "",
      "1️⃣ Activar modo bridge",
    ].join("\n");
  }

  async handleSubmenuCommand(
    sender: string,
    command: string,
    _data: Record<string, any>,
  ): Promise<boolean> {
    if (command === "1") {
      if (!this.authorizedIds.has(sender)) {
        await this.whatsappService.sendMessage(
          sender,
          "❌ No estás autorizado para usar el bridge de Telegram.",
        );
        return true;
      }
      this.stateMachine.setState(sender, { context: "bridge::active", data: {} });
      this.telegramBridgeService.enterBridge(sender);
      await this.whatsappService.sendMessage(
        sender,
        "🔗 Modo bridge activado. Escribí mensaje y se reenviará al grupo de Telegram. Mandá 'menu' o '0' para salir.",
      );
      return true;
    }
    return false;
  }

  async handleWaitingInput(
    _sender: string,
    _text: string,
    _context: string,
    _data: Record<string, any>,
  ): Promise<boolean> {
    return false;
  }

  getTextAliases(): string[] {
    return ["telegram", "chat telegram"];
  }

  getHelpEntries(): string[] {
    return ["Chat Telegram — Conecta con el grupo de Telegram"];
  }
}
