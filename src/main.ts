import express from 'express';
import { WahaClient, WhatsAppService } from "@task-bot/whatsapp-core";
import { TelegramClient, BridgeTelegramService, ReplyInfo } from "@task-bot/telegram-core";
import { MessageHandler } from './interface/whatsapp/MessageHandler';
import { ConversationStateMachine } from './interface/whatsapp/ConversationStateMachine';
import { BridgeFeature } from './interface/whatsapp/features/telegram/BridgeFeature';
import { BotFeature } from './interface/whatsapp/features/BotFeature';
import { TelegramBridgeService } from './application/services/TelegramBridgeService';
import { TursoUserStateRepository } from './infrastructure/db/TursoUserStateRepository';
import { createDatabase, userStates } from "@task-bot/db-core";
import { env } from './infrastructure/config/env';
import { logger } from './infrastructure/logger.js';

class App {
  private app: express.Application;
  private wahaClient: WahaClient;
  private whatsappService: WhatsAppService;
  private telegramClient?: TelegramClient;
  private telegramBridgeService?: TelegramBridgeService;
  private messageHandler: MessageHandler | null = null;
  private stateMachine!: ConversationStateMachine;

  constructor() {
    this.app = express();

    this.wahaClient = new WahaClient({
      wahaBaseUrl: env.WAHA_BASE_URL,
      wahaApiKey: env.WAHA_API_KEY,
      sessionName: env.WAHA_SESSION_NAME,
      cacheTtlMs: env.TTL_CACHE_MESSAGES,
      cacheMaxSize: 200,
      contactsCacheTtlMs: 300_000,
      concurrency: env.WHATSAPP_CONCURRENCY,
    });
    this.whatsappService = new WhatsAppService();

    // ── Database & state machine ─────────────────────────────
    const db = createDatabase(
      { driver: "turso", url: env.TURSO_URL, authToken: env.TURSO_TOKEN },
      { userStates },
    );
    const userStateRepo = new TursoUserStateRepository(db);
    this.stateMachine = new ConversationStateMachine(userStateRepo);

    // ── Bridge authorized IDs ────────────────────────────────
    const parseIds = (raw: string): string[] => {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String);
        } catch { /* fall through to CSV */ }
      }
      return trimmed.split(",").map(id => id.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    };

    const bridgeAuthorizedIds = new Set(parseIds(env.BRIDGE_AUTHORIZED_WPP_IDS));

    // ── Telegram Bridge (conditional) ────────────────────────
    let features: BotFeature[] = [];

    if (env.BRIDGE_BOT_TOKEN && env.TELEGRAM_GROUP_ID !== 0) {
      this.telegramClient = new TelegramClient({
        botToken: env.BRIDGE_BOT_TOKEN,
        groupId: env.TELEGRAM_GROUP_ID,
      });

      const bridgeTelegramService = new BridgeTelegramService(this.telegramClient);

      this.telegramBridgeService = new TelegramBridgeService(
        this.whatsappService,
        bridgeTelegramService,
        env.TELEGRAM_GROUP_ID,
        this.stateMachine,
      );

      const bridgeFeature = new BridgeFeature(
        this.whatsappService,
        this.stateMachine,
        this.telegramBridgeService,
        bridgeAuthorizedIds,
      );

      // ── Set TG → WPP message forwarding ─────────────────────
      this.telegramClient.setOnMessageCallback(
        async (text: string, fromName: string, replyTo?: ReplyInfo) => {
          try {
            await this.telegramBridgeService!.sendToWhatsApp(text, fromName, replyTo);
          } catch (err) {
            logger.error({ fromName, err }, "Error forwarding text TG→WPP");
          }
        },
      );

      // ── Set TG → WPP media forwarding ────────────────────────
      this.telegramClient.setOnMediaCallback(
        async (base64: string, mimetype: string, caption: string | undefined, fromName: string, fileName?: string, isSticker?: boolean, replyTo?: ReplyInfo) => {
          try {
            await this.telegramBridgeService!.sendMediaToWhatsApp(
              base64, mimetype, caption, fromName, fileName, isSticker, replyTo,
            );
          } catch (err) {
            logger.error({ fromName, mimetype, err }, "Error forwarding media TG→WPP");
          }
        },
      );

      this.telegramClient.start();
      features = [bridgeFeature];
    } else {
      logger.warn("Telegram bridge disabled: BRIDGE_BOT_TOKEN or TELEGRAM_GROUP_ID not configured");
    }

    // ── Universal incoming media handler (bridge mode only) ──
    this.wahaClient.setIncomingMediaHandler(
      async (base64: string, mimetype: string, sender: string, caption?: string, fileName?: string, durationSeconds?: number, isSticker?: boolean, replyContext?: { text: string; from?: string }) => {
        try {
          if (this.telegramBridgeService?.isActive(sender)) {
            await this.telegramBridgeService.sendMediaToTelegram(
              sender, base64, mimetype, caption, fileName, isSticker, replyContext,
            );
            await this.whatsappService.sendMessage(
              sender,
              "✅ Media enviado al grupo",
            );
          } else {
            await this.whatsappService.sendMessage(
              sender,
              "📨 Envia un mensaje para activar el bridge antes de compartir medios.",
            );
          }
        } catch (err) {
          logger.error({ sender, err }, "Error processing media");
          try {
            await this.whatsappService.sendMessage(
              sender,
              "❌ Error al procesar el archivo multimedia.",
            );
          } catch {}
        }
      },
    );

    this.messageHandler = new MessageHandler(
      this.whatsappService,
      this.stateMachine,
      features,
      bridgeAuthorizedIds,
      env.BOT_WELCOME_MESSAGE,
      this.telegramBridgeService,
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/status', (req, res) => {
      const connectedNumber = this.wahaClient.getConnectedNumber();
      res.json({
        whatsapp: connectedNumber ? 'connected' : 'disconnected',
        number: connectedNumber,
        sessionStatus: this.wahaClient.getSessionStatus(),
      });
    });

    this.app.get('/api/qr-status', (req, res) => {
      res.json(this.wahaClient.getQrStatus());
    });
  }

  async start(): Promise<void> {
    logger.info("Iniciando Tasks Bot (WAHA + GOWS)...");

    try {
      await this.wahaClient.initialize();

      // ── Restore persistent conversation states ──
      await this.stateMachine.loadFromDB();

      this.wahaClient.setOnConnectedCallback((number: string) => {
        this.whatsappService.setSenderNumber(number);
        logger.info({ number }, "WhatsApp number connected");
      });

      this.whatsappService.setMessageSender(
        async (to: string, message: string) => {
          return await this.wahaClient.sendMessage(to, message);
        },
      );

      this.whatsappService.setEditMessageSender(
        async (to: string, messageId: string, content: string) => {
          await this.wahaClient.editMessage(to, messageId, content);
        },
      );

      // ── Media sender: bridge → WhatsApp ──────────────────
      this.whatsappService.setMediaSender(
        async (to: string, base64: string, mimetype: string, caption?: string, fileName?: string, isSticker?: boolean) => {
          return await this.wahaClient.sendMedia(to, base64, mimetype, caption, fileName, isSticker);
        },
      );

      // ── Media URL sender ────────────────────────────────
      this.whatsappService.setMediaUrlSender(
        async (to: string, url: string, caption?: string, headers?: Record<string, string>) => {
          return await this.wahaClient.sendMediaFromUrl(to, url, caption, headers);
        },
      );

      // ── Contact search handler ─────────────────────────
      this.whatsappService.setContactSearchHandler(
        async (query: string) => await this.wahaClient.searchContacts(query),
      );

      this.wahaClient.setMessageHandler(this.messageHandler!);

      logger.info("Connecting to WAHA... Check dashboard for QR if needed.");

      const port = env.PORT;
      this.app.listen(port, () => {
        logger.info({ port }, "API REST disponible");
      });

    } catch (error) {
      console.error("RAW ERROR:", error);
      logger.error(
        { error, msg: error instanceof Error ? error.message : String(error) },
        "Error iniciando la aplicación",
      );
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info("Deteniendo aplicación...");
    await this.wahaClient.logout();
    this.telegramClient?.stop();
    process.exit(0);
  }
}

const app = new App();
app.start();

process.on('SIGINT', () => app.stop());
process.on('SIGTERM', () => app.stop());
