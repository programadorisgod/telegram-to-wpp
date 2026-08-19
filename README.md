# Tasks Bot — Bridge WhatsApp ↔ Telegram

Bot puente bidireccional entre WhatsApp y Telegram. Los mensajes y media se reenvían en tiempo real entre ambos canales.

---

## Stack

| Componente | Tecnología |
|---|---|
| **Runtime** | Node.js >= 20 + TypeScript 5.6 |
| **Package Manager** | pnpm (workspaces) |
| **WhatsApp** | whatsapp-web.js v1.34 (Puppeteer/Chromium) |
| **Telegram** | telegraf v4.16 |
| **Base de Datos** | Turso DB (SQLite vía libsql) |
| **ORM** | Drizzle ORM v0.38 + Drizzle Kit |
| **HTTP** | Express v4.21 |
| **Logging** | pino v9.5 |
| **Dev Runner** | tsx v4.19 |
| **Producción** | PM2 + Docker |
| **Zona Horaria** | America/Bogota |

---

## Features

### 🔗 Puente Bidireccional

- **Texto** — WhatsApp ↔ Telegram, con nombre de usuario
- **Imágenes** — reenvío bidireccional con caption
- **Audio / Voice notes** — ambos sentidos
- **Video / Video notes / GIFs** — Telegram → WhatsApp
- **Stickers** — estáticos (WebP) y animados (notificación)
- **Documentos** — Telegram → WhatsApp
- **Replies / Quoted messages** — el texto original y autor se incluyen

### Auth Gate

Solo IDs de WhatsApp autorizados en `BRIDGE_AUTHORIZED_WPP_IDS` pueden usar el bridge.

### Sesiones Persistentes

Los estados de conversación se guardan en Turso (`user_states`) y se restauran al reiniciar el bot. Sesiones zombies se limpian automáticamente después de 15 min de inactividad.

### QR Web

Interfaz web en `/scan` para escanear el código QR de WhatsApp con auto-polling.

---

## Estructura del Monorepo

```
task-chatbot/
├── packages/
│   ├── whatsapp-core/       # Cliente WhatsApp (Baileys)
│   │   └── src/
│   │       ├── ports/       # IWhatsAppService, IMessageHandler
│   │       ├── client/      # BaileysClient (conexión, QR, reconexión)
│   │       ├── services/    # WhatsAppService
│   │       └── types.ts
│   │
│   ├── telegram-core/       # Cliente Telegram (telegraf)
│   │   └── src/
│   │       ├── ports/       # ITelegramService
│   │       ├── client/      # TelegramClient (mensajes, media, replies)
│   │       ├── services/    # BridgeTelegramService
│   │       └── types.ts
│   │
│   ├── db-core/             # Factoría DB + schema Drizzle
│   │   └── src/
│   │       ├── schema/      # user_states + otros schemas
│   │       ├── factory.ts   # createDatabase(driver, schema)
│   │       └── types.ts
│   │
│   └── ai-core/             # Motor de IA (no usado actualmente)
│
├── src/                     # App principal
│   ├── main.ts              # DI composition, Express, lifecycle
│   ├── application/
│   │   └── services/        # TelegramBridgeService
│   ├── infrastructure/
│   │   ├── config/          # env.ts + userMapping
│   │   ├── db/              # TursoUserStateRepository
│   │   ├── utils/           # TTLCache
│   │   └── logger.ts
│   └── interface/
│       └── whatsapp/
│           ├── MessageHandler.ts
│           ├── ConversationStateMachine.ts
│           └── features/
│               ├── BotFeature.ts
│               └── telegram/
│                   └── BridgeFeature.ts
│
├── docs/
├── scripts/
├── Dockerfile
├── ecosystem.config.js
└── drizzle.config.ts
```

---

## Instalación

### Requisitos

- Node.js >= 20.0.0
- pnpm (`npm install -g pnpm`)
- Chromium/Chrome (necesario para whatsapp-web.js)

```bash
pnpm install
```

### Variables de Entorno

Copiar `.env.example` a `.env` y completar:

```bash
cp .env.example .env
```

Ver `docs/env.md` para la referencia completa.

### Migraciones

```bash
pnpm run db:push       # Aplicar a Turso
pnpm run db:studio     # Drizzle Studio UI
```

---

## Inicio

```bash
pnpm run dev
```

Escanear el código QR en `http://localhost:5199/scan` con WhatsApp > Dispositivos vinculados.

Una vez conectado, desde WhatsApp enviar `telegram` o `chat telegram` → opción `1` para activar el bridge.

---

## Arquitectura

### Screaming Architecture

```
src/
├── application/        # Casos de uso y lógica de aplicación
├── infrastructure/     # Adaptadores concretos (DB, config, cache)
└── interface/          # Presentación (MessageHandler, Features)
```

### Feature Registry Pattern

`BridgeFeature` implementa `BotFeature` y se registra condicionalmente en `main.ts` si las variables de Telegram están configuradas.

```
main.ts
  ├── BaileysClient + WhatsAppService
  ├── createDatabase → TursoUserStateRepository
  ├── ConversationStateMachine
  ├── TelegramClient + BridgeTelegramService
  ├── BridgeFeature (solo si hay token + groupId)
  └── MessageHandler(features, stateMachine, bridgeService)
```

### Flujo de mensajes

```
WhatsApp → BaileysClient
  → MessageHandler.handle(text, sender)
     ├── ¿Auth gate?         → bienvenida si no autorizado
     ├── ¿bridge::active?    → reenviar a Telegram
     ├── ¿Comando "1"?       → BridgeFeature.handleSubmenuCommand
     └── Default             → menú BridgeFeature

Telegram → TelegramClient
  → onMessage/onMedia callback
  → TelegramBridgeService.sendToWhatsApp / sendMediaToWhatsApp
```

### Inyección de Dependencias (manual)

No hay contenedor DI. Todo se construye en `main.ts` por constructor.

Ver `docs/architecture.md` para más detalles.

---

## API REST

| Endpoint | Método | Descripción |
|---|---|---|
| `/health` | GET | Estado del servicio |
| `/status` | GET | Estado de WhatsApp + número conectado |
| `/api/qr-status` | GET | Estado del QR (status, qr, number) |
| `/scan` | GET | Página web para escanear QR con auto-polling |

---

## Comandos de Desarrollo

```bash
pnpm run dev           # Desarrollo con hot-reload (tsx watch)
pnpm run build         # Build completo (paquetes + tsc)
pnpm run start         # Producción desde dist/
pnpm run typecheck     # TypeScript check (tsc --noEmit)
pnpm run lint          # ESLint
pnpm run db:push       # Aplicar migraciones Drizzle
pnpm run db:generate   # Generar migración Drizzle
pnpm run db:migrate    # Correr migraciones (Drizzle Kit)
pnpm run db:studio     # Drizzle Studio UI
pnpm run clean         # Limpiar sessions, .wwebjs_cache, dist
pnpm run clean:all     # Lo mismo + node_modules
```

---

## Despliegue

### Docker

```bash
docker build -t tasks-bot .
```

### PM2

```bash
pnpm run build
pm2 start ecosystem.config.js
pm2 logs tasks-bot
```

Ver `docs/deployment.md` para más detalles.

---

## Documentación

- `docs/architecture.md` — Arquitectura, patrones, decisiones técnicas
- `docs/telegram-bridge.md` — Bridge bidireccional WhatsApp ↔ Telegram
- `docs/development.md` — Flujo de desarrollo, scripts, troubleshooting
- `docs/deployment.md` — Docker, PM2, producción
- `docs/env.md` — Referencia completa de variables de entorno
# telegram-to-wpp

---

## WAHA Setup

WAHA (WhatsApp HTTP API) runs as a Docker service and handles the WhatsApp connection via the GOWS engine.

### 1. Create `.waha.env`

Copy the example and generate credentials:

```bash
cp .waha.env.example .waha.env
```

Edit `.waha.env` and replace the placeholder values:

```
WAHA_API_KEY=<generate-with-openssl-rand-hex-24>
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=<generate-with-openssl-rand-hex-24>
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=<same-password-as-above>
```

To generate random secrets:

```bash
openssl rand -hex 24
```

### 2. Start WAHA

```bash
sudo docker compose up -d waha
```

This uses `docker-compose.yml` which maps port `3005 → 3000`, loads `.waha.env`, and uses named volumes for persistent sessions and media.

### 3. Access the Dashboard

Open `http://localhost:3005` and log in with the credentials from `.waha.env`.

> **Note:** Do not pass the app's `.env` file to WAHA — it contains Telegram/DB secrets unrelated to WhatsApp. WAHA must be configured with its own `.waha.env` file.

### Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Empty response / `NS_ERROR_NET_EMPTY_RESPONSE` | Missing or wrong env file | Make sure `.waha.env` exists and restart the container |
| Port already in use after reboot | Old container still running | `sudo docker stop waha && sudo docker rm waha`, then restart |
| QR not generating | GOWS engine not starting | Check logs: `sudo docker compose logs waha` |
