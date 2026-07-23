import express from 'express';
import { BaileysClient, WhatsAppService } from "@task-bot/whatsapp-core";
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
  private baileysClient: BaileysClient;
  private whatsappService: WhatsAppService;
  private telegramClient?: TelegramClient;
  private telegramBridgeService?: TelegramBridgeService;
  private messageHandler: MessageHandler | null = null;
  private stateMachine!: ConversationStateMachine;

  constructor() {
    this.app = express();

    this.baileysClient = new BaileysClient({
      sessionPath: env.WHATSAPP_SESSION_PATH,
      chromePath: env.CHROME_PATH,
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
      );

      const bridgeFeature = new BridgeFeature(
        this.whatsappService,
        this.stateMachine,
        this.telegramBridgeService,
        bridgeAuthorizedIds,
      );

      // ── Set TG → WPP message forwarding ─────────────────────
      this.telegramClient.setOnMessageCallback(
        (text: string, fromName: string, replyTo?: ReplyInfo) => {
          this.telegramBridgeService!.sendToWhatsApp(text, fromName, replyTo);
        },
      );

      // ── Set TG → WPP media forwarding ────────────────────────
      this.telegramClient.setOnMediaCallback(
        (base64: string, mimetype: string, caption: string | undefined, fromName: string, fileName?: string, isSticker?: boolean, replyTo?: ReplyInfo) => {
          this.telegramBridgeService!.sendMediaToWhatsApp(
            base64, mimetype, caption, fromName, fileName, isSticker, replyTo,
          );
        },
      );

      this.telegramClient.start();
      features = [bridgeFeature];
    } else {
      logger.warn("Telegram bridge disabled: BRIDGE_BOT_TOKEN or TELEGRAM_GROUP_ID not configured");
    }

    // ── Universal incoming media handler (bridge mode only) ──
    this.baileysClient.setIncomingMediaHandler(
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
      const connectedNumber = this.baileysClient.getConnectedNumber();
      res.json({
        whatsapp: connectedNumber ? 'connected' : 'disconnected',
        number: connectedNumber,
      });
    });

    this.app.get('/api/qr-status', (req, res) => {
      res.json(this.baileysClient.getQrStatus());
    });

    this.app.get('/scan', (req, res) => {
      res.type('html').send(this.qrPage());
    });
  }

  private qrPage(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tasks Bot — Conexión WhatsApp</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #111;
      color: #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #1a1a2e;
      border-radius: 20px;
      padding: 2.5rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    h1 { font-size: 1.3rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
    #qr-container {
      background: #fff;
      border-radius: 16px;
      padding: 1rem;
      display: inline-block;
      margin-bottom: 1rem;
      min-width: 280px;
      min-height: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #qr-container img { display: block; max-width: 100%; }
    #status {
      font-size: 0.95rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      display: inline-block;
      margin-top: 0.5rem;
    }
    .waiting { background: #2a2a4a; color: #f0c040; }
    .connected { background: #1a3a2a; color: #4caf50; }
    .error { background: #3a1a1a; color: #f44336; }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #333;
      border-top-color: #f0c040;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer { margin-top: 1.5rem; color: #555; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📱 Tasks Bot</h1>
    <p class="subtitle">Escanea el código QR con WhatsApp para conectar</p>

    <div id="qr-container">
      <div class="spinner"></div>
    </div>

    <div id="status" class="waiting">⏳ Esperando código QR...</div>
    <div class="footer" id="number"></div>
  </div>

  <script>
    async function poll() {
      try {
        const res = await fetch('/api/qr-status');
        const data = await res.json();
        const container = document.getElementById('qr-container');
        const statusEl = document.getElementById('status');
        const numberEl = document.getElementById('number');

        statusEl.className = '';

        if (data.status === 'connected') {
          statusEl.className = 'connected';
          statusEl.textContent = '✅ Conectado';
          container.innerHTML = '<span style="font-size:3rem;">✅</span>';
          numberEl.textContent = '📞 ' + data.number;
        } else if (data.status === 'error') {
          statusEl.className = 'error';
          statusEl.textContent = '❌ Error de conexión';
          container.innerHTML = '<span style="font-size:3rem;">❌</span>';
        } else if (data.qr) {
          statusEl.className = 'waiting';
          statusEl.textContent = '📷 Escanea el código QR';
          container.innerHTML = '<img src="' + data.qr + '" alt="QR Code" />';
          numberEl.textContent = '';
        } else {
          statusEl.className = 'waiting';
          statusEl.textContent = '⏳ Esperando código QR...';
          container.innerHTML = '<div class="spinner"></div>';
        }
      } catch {
        // server not ready yet, keep polling
      }
    }

    poll();
    setInterval(poll, 2000);
  </script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    logger.info("Iniciando Tasks Bot (Bridge mode)...");

    try {
      await this.baileysClient.initialize();

      // ── Restore persistent conversation states ──
      await this.stateMachine.loadFromDB();

      this.baileysClient.setOnConnectedCallback((number: string) => {
        this.whatsappService.setSenderNumber(number);
        logger.info({ number }, "WhatsApp number connected");
      });

      this.whatsappService.setMessageSender(
        async (to: string, message: string) => {
          return await this.baileysClient.sendMessage(to, message);
        },
      );

      this.whatsappService.setEditMessageSender(
        async (to: string, messageId: string, content: string) => {
          await this.baileysClient.editMessage(to, messageId, content);
        },
      );

      // ── Media sender: bridge → WhatsApp ──────────────────
      this.whatsappService.setMediaSender(
        async (to: string, base64: string, mimetype: string, caption?: string, fileName?: string, isSticker?: boolean) => {
          return await this.baileysClient.sendMedia(to, base64, mimetype, caption, fileName, isSticker);
        },
      );

      // ── Media URL sender ────────────────────────────────
      this.whatsappService.setMediaUrlSender(
        async (to: string, url: string, caption?: string, headers?: Record<string, string>) => {
          return await this.baileysClient.sendMediaFromUrl(to, url, caption, headers);
        },
      );

      // ── Contact search handler ─────────────────────────
      this.whatsappService.setContactSearchHandler(
        async (query: string) => await this.baileysClient.searchContacts(query),
      );

      this.baileysClient.setMessageHandler(this.messageHandler!);

      logger.info("Esperando conexión de WhatsApp... Escanea el QR si aparece.");

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
    await this.baileysClient.logout();
    this.telegramClient?.stop();
    process.exit(0);
  }
}

const app = new App();
app.start();

process.on('SIGINT', () => app.stop());
process.on('SIGTERM', () => app.stop());