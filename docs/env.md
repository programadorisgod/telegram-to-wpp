# Variables de Entorno — Referencia Completa

Todas las variables se validan con Zod en `src/infrastructure/config/env.ts`.

---

## Base de Datos (Turso)

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `TURSO_URL` | ✅ | — | URL completa de Turso DB (`libsql://tu-db.turso.io`) |
| `TURSO_TOKEN` | — | — | Token de autenticación Turso (requerido en producción) |

Usado para persistir estados de conversación en la tabla `user_states`.

---

## WhatsApp

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `WHATSAPP_SESSION_PATH` | — | `./sessions` | Ruta para persistir sesión de WhatsApp |
| `CHROME_PATH` | — | `/usr/bin/chromium` | Ruta al binario de Chromium/Chrome |

---

## Telegram Bridge

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `BRIDGE_BOT_TOKEN` | — | `""` | Token del bot de Telegram (de @BotFather). Vacío = bridge desactivado |
| `TELEGRAM_GROUP_ID` | — | `0` | ID numérico del grupo de Telegram. `0` = bridge desactivado |
| `BRIDGE_AUTHORIZED_WPP_IDS` | — | `""` | IDs de WhatsApp autorizados para bridge. CSV o JSON array |

Si `BRIDGE_BOT_TOKEN` está vacío o `TELEGRAM_GROUP_ID` es 0, el bridge y toda la feature se desactivan.

---

## Caches (TTL en milisegundos)

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `TTL_CACHE_USER_STATES` | — | `1800000` (30 min) | TTL de estados de conversación en memoria |
| `TTL_CACHE_SESSIONS` | — | `900000` (15 min) | TTL de sesiones bridge (zombie cleanup) |
| `TTL_CACHE_MESSAGES` | — | `300000` (5 min) | TTL de caché de dedup de mensajes |

Mínimo: 60000 (1 min). Valores por debajo se rechazan.

---

## Servidor

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `PORT` | — | `5199` | Puerto del servidor HTTP Express |
| `NODE_ENV` | — | `development` | Entorno: `development`, `production`, `test` |
| `LOG_LEVEL` | — | `info` | Nivel de logging: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `BOT_WELCOME_MESSAGE` | — | `Bienvenido al bot` | Mensaje para usuarios no autorizados |

---

## Concurrencia

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `WHATSAPP_CONCURRENCY` | — | `3` | Máximo de operaciones concurrentes sobre WhatsApp |
