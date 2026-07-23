# Arquitectura

## Screaming Architecture

El proyecto sigue **Screaming Architecture**: la estructura de carpetas `src/` refleja el propósito del sistema, no el framework.

### Capas

```
src/
├── application/         # Lógica de aplicación
│   └── services/        # TelegramBridgeService
│
├── infrastructure/      # Adaptadores concretos
│   ├── config/          # env.ts (Zod) + userMapping
│   ├── db/              # TursoUserStateRepository
│   ├── utils/           # TTLCache
│   └── logger.ts        # pino logger
│
└── interface/           # Presentación
    └── whatsapp/
        ├── MessageHandler.ts
        ├── ConversationStateMachine.ts
        └── features/
            ├── BotFeature.ts           # Interfaz base
            └── telegram/
                └── BridgeFeature.ts    # Única feature
```

En esta branch **no hay capa `domain/`** porque el bot no tiene entidades de negocio complejas. Es puramente un puente de mensajería.

---

## Feature Registry Pattern

`BridgeFeature` implementa `BotFeature`:

```typescript
interface BotFeature {
  readonly name: string;
  getMenuEntries(): string[];
  getSubmenuMenu?(): string;
  handleSubmenuCommand?(sender, command, data): Promise<boolean>;
  handleWaitingInput?(sender, text, context, data): Promise<boolean>;
  getTextAliases?(): string[];
  getHelpEntries?(): string[];
  isAvailableFor?(sender): boolean;
}
```

Las features se registran en `main.ts` y `MessageHandler` itera sobre el array para routing.

### Única feature registrada

| Feature | name | Aliases textuales | Condición |
|---|---|---|---|
| Telegram Bridge | `telegram` | `telegram`, `chat telegram` | `BRIDGE_BOT_TOKEN` + `TELEGRAM_GROUP_ID` configurados |

---

## Inyección de Dependencias (manual)

No hay contenedor DI. Todo se construye en `main.ts`:

```
main.ts
  ├── BaileysClient(config)
  ├── WhatsAppService()
  ├── createDatabase → TursoUserStateRepository
  ├── ConversationStateMachine(userStateRepo)
  ├── TelegramClient(config)                [condicional]
  ├── BridgeTelegramService(telegramClient) [condicional]
  ├── TelegramBridgeService(wpp, tg, group) [condicional]
  ├── BridgeFeature(wpp, stateMachine, bridge) [condicional]
  └── MessageHandler(wpp, stateMachine, features, authorizedIds, welcome)
```

---

## Flujo de Mensajes

```
WhatsApp entrante
  → BaileysClient → MessageHandler.handle(text, sender)
     ├── Auth gate:   ¿autorizado? no → welcome message
     ├── Bridge mode: ¿contexto bridge::active? → reenviar a Telegram
     ├── Comando "1": → BridgeFeature.handleSubmenuCommand
     └── Default:     → menú BridgeFeature

Telegram entrante
  → Telegraf polling → onMessage/onMedia callback
  → TelegramBridgeService.sendToWhatsApp / sendMediaToWhatsApp
  → Broadcast a todas las sesiones bridge activas
```

---

## ConversationStateMachine

Máquina de estados con persistencia opcional en Turso:

```typescript
state: { context: string, data: Record<string, any> }
// bridge::active → el sender está en modo bridge
// main → estado por defecto
```

**Persistencia:** los estados se guardan en `user_states` (Turso) y se restauran al boot via `loadFromDB()`. Los estados stale (>24h) se eliminan.

**Zombie cleanup:** las sesiones bridge con más de 15 min de inactividad se limpian automáticamente.

---

## TTLCache

Caché LRU con TTL para 3 propósitos:

| Cache | TTL Default | Propósito |
|---|---|---|
| `TTL_CACHE_USER_STATES` | 30 min | Estados de conversación en memoria |
| `TTL_CACHE_SESSIONS` | 15 min | Sesiones bridge activas (zombie cleanup) |
| `TTL_CACHE_MESSAGES` | 5 min | Dedup de mensajes entrantes |

---

## userMapping

Mapping hardcodeado de WhatsApp IDs a nombres de usuario:

```typescript
export const wppIdToName: Record<string, string> = {
  "211707561525347@lid": "Juan",
  "176810985787444@lid": "Manuel",
  // ...
};
```

Se usa para mostrar el nombre del remitente en los mensajes reenviados.

---

## Paquetes del Monorepo

### `@task-bot/whatsapp-core`

Cliente WhatsApp usando `whatsapp-web.js` (Baileys).

- **Ports:** `IWhatsAppService` (sendMessage, sendMedia, sendMediaFromUrl, sendMenu, editMessage), `IMessageHandler`
- **Client:** `BaileysClient` — conexión, QR, reconexión, dedup
- **Services:** `WhatsAppService` — backend intercambiable
- **Utils:** `SimpleTTLCache`

### `@task-bot/telegram-core`

Cliente Telegram usando `telegraf`.

- **Port:** `ITelegramService` — sendMessage, sendPhoto, sendAudio, sendVideo, sendSticker, sendDocument
- **Client:** `TelegramClient` — polling, mensajes, media, replies, stickers, video notes, GIFs, documentos
- **Service:** `BridgeTelegramService` — wrapper que implementa `ITelegramService`

### `@task-bot/db-core`

Factory de base de datos con Drizzle ORM.

- **Schema:** 10 tablas (users, tasks, projects, notes, image_reminders, audio_reminders, project_updates, user_states, reminder_events)
- **Drivers:** Turso (libsql). Neon (postgres) disponible como peer dep
- **Factory:** `createDatabase(driverConfig, schema)` — retorna `DrizzleDB`

Solo `user_states` se usa activamente en esta branch.

### `@task-bot/ai-core`

Motor de IA intercambiable. **No se usa actualmente.** Presente para uso futuro.

---

## Validación de Entorno

Todas las variables se validan con Zod en `src/infrastructure/config/env.ts`:
- Valores default para desarrollo
- Coerción de tipos (number, enum)
- Error claro al boot si falta `TURSO_URL`
