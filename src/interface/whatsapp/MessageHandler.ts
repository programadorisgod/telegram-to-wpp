import { IWhatsAppService, IMessageHandler, type ReplyContext } from "@task-bot/whatsapp-core";
import { ConversationStateMachine } from "./ConversationStateMachine";
import { BotFeature } from "./features/BotFeature";
import { TelegramBridgeService } from "../../application/services/TelegramBridgeService";

export class MessageHandler implements IMessageHandler {
    constructor(
        private whatsappService: IWhatsAppService,
        private stateMachine: ConversationStateMachine,
        private features: BotFeature[],
        private authorizedIds: Set<string>,
        private welcomeMessage: string,
        private telegramBridgeService?: TelegramBridgeService,
    ) {}

    async handle(text: string, sender: string, replyContext?: ReplyContext): Promise<void> {
        // ── Auth gate ─────────────────────────────────────
        if (this.authorizedIds.size > 0 && !this.authorizedIds.has(sender)) {
            console.warn(`[AUTH] Unauthorized access attempt from: ${sender}`);
            await this.whatsappService.sendMessage(sender, this.welcomeMessage);
            return;
        }

        const normalizedText = text.trim().toLowerCase();
        const state = this.stateMachine.getState(sender);

        // ── Bridge mode interceptor ──────────────────────
        if (state.context === "bridge::active" && this.telegramBridgeService) {
            if (normalizedText === "menu" || normalizedText === "0" || normalizedText === "inicio" || normalizedText === "salir") {
                this.telegramBridgeService.exitBridge(sender);
                this.stateMachine.setState(sender, { context: "main", data: {} });
                await this.whatsappService.sendMessage(
                    sender,
                    "🔌 Bridge desactivado.",
                );
                return;
            }
            await this.telegramBridgeService.sendToTelegram(sender, text, replyContext);
            await this.whatsappService.sendMessage(sender, "✅ Mensaje enviado al grupo");
            return;
        }

        // ── Not in bridge mode — route to features ──
        if (normalizedText === "menu" || normalizedText === "inicio" || normalizedText === "0") {
            await this.sendFeatureMenu(sender);
            return;
        }

        // Route numeric commands and aliases to features
        for (const feature of this.features) {
            if (normalizedText === "1" || (feature.getTextAliases?.() || []).includes(normalizedText)) {
                this.stateMachine.setState(sender, { context: feature.name + "::menu", data: {} });
                const handled = await feature.handleSubmenuCommand?.(sender, normalizedText, {});
                if (handled) return;
            }
        }

        // Default: show feature menu
        await this.sendFeatureMenu(sender);
    }

    private async sendFeatureMenu(sender: string): Promise<void> {
        for (const feature of this.features) {
            if (feature.getSubmenuMenu) {
                await this.whatsappService.sendMenu(sender, feature.getSubmenuMenu());
                return;
            }
        }
        await this.whatsappService.sendMessage(sender, this.welcomeMessage);
    }
}