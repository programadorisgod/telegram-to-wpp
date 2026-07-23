# Telegram Bridge

Puente bidireccional entre WhatsApp y Telegram. Permite chatear desde WhatsApp con un grupo de Telegram como si fuera el mismo chat.

---

## Cómo funciona

### Activación

Desde WhatsApp, el usuario autorizado escribe `telegram` o `chat telegram` y selecciona opción 1:

```
📱 *Chat con Telegram*

1️⃣ Activar modo bridge
```

Una vez activado, **todo** mensaje de texto que el usuario mande desde WhatsApp se reenvía al grupo de Telegram. Mensajes del grupo de Telegram se reenvían a WhatsApp.

### Desactivación

El usuario manda `menu`, `0`, `inicio`, `salir` desde WhatsApp para salir del modo bridge.

### Sesiones zombies

Si el usuario activa el bridge pero nunca manda `menu`/`0`, la sesión expira automáticamente después de 15 minutos de inactividad (`TTL_CACHE_SESSIONS`). Al enviar un mensaje, se renueva el timestamp.

---

## Bidireccionalidad

```
WhatsApp ──texto──→ Telegram
WhatsApp ──media──→ Telegram (imagen, audio, video, sticker)
WhatsApp ──reply──→ Telegram (con quoted message)

Telegram ──texto──→ WhatsApp
Telegram ──media──→ WhatsApp (imagen, audio, video, sticker, documento)
Telegram ──reply──→ WhatsApp (con quoted message + autor)
```

### Soporte de Media

| Tipo | WhatsApp → Telegram | Telegram → WhatsApp |
|---|---|---|
| Texto | ✅ | ✅ |
| Imagen (foto) | ✅ | ✅ |
| Audio | ✅ | ✅ |
| Video | ✅ | ✅ |
| Sticker (WebP) | ✅ | ✅ (estáticos) |
| Sticker animado | — | ❌ (notificación) |
| Video note | — | ✅ |
| GIF / Animation | — | ✅ |
| Documento | — | ✅ |
| Voice message | ✅ | ✅ |

### Replies / Quoted Messages

Los mensajes respondidos en Telegram incluyen el texto original y el autor en el reenvío a WhatsApp:

```
↪️ *Respondió a [Autor]*: [Texto original]
━━━━━━━━━━━━━
👤 [Nombre]: [Nuevo mensaje]
```

Cuando hay cadenas de replies anidadas (varios niveles), `TelegramBridgeService.cleanQuotedText()` colapsa la cadena al último autor + último contenido:

```
👤 Juan: Ño
```

### Formato de mensajes reenviados

**WhatsApp → Telegram:**
```
👤 [Nombre]: Mensaje
```

**WhatsApp → Telegram (reply):**
```
👤 [Nombre]
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
🔁 [Texto quoteado]
━━━━━━━━━━━━━━━━━━━━━
👤 [Nombre]: Mensaje
```

---

## Arquitectura

```
                    ┌──────────────────────────────────────┐
                    │           BridgeFeature               │
                    │  (BotFeature — activa bridge)         │
                    └────────────┬─────────────────────────┘
                                 │
                    ┌────────────▼─────────────────────────┐
                    │        TelegramBridgeService           │
                    │  (application/service — orquesta)     │
                    └────────────┬──────────────────┬───────┘
                                 │                  │
                    ┌────────────▼──────┐  ┌───────▼────────────┐
                    │  WhatsAppService  │  │ BridgeTelegramSvc  │
                    │ (@whatsapp-core)  │  │ (@telegram-core)   │
                    │                   │  │                    │
                    │  sendMessage()    │  │  sendMessage()     │
                    │  sendMedia()      │  │  sendPhoto()       │
                    │  sendMediaFromUrl │  │  sendAudio()       │
                    └───────────────────┘  │  sendVideo()       │
                                           │  sendSticker()     │
                                           │  sendDocument()    │
                                           └────────────────────┘
```

### TelegramClient

En `main.ts` se configuran dos callbacks:

```typescript
// Mensajes de texto (con reply opcional)
telegramClient.setOnMessageCallback((text, fromName, replyTo) => {
  telegramBridgeService.sendToWhatsApp(text, fromName, replyTo);
});

// Media (imagen, audio, video, sticker, documento, etc.)
telegramClient.setOnMediaCallback((base64, mimetype, caption, fromName, fileName, isSticker) => {
  telegramBridgeService.sendMediaToWhatsApp(base64, mimetype, caption, fromName, fileName, isSticker);
});
```

### Incoming Media Handler (WhatsApp → Telegram)

En `main.ts`, el handler universal de media decide si reenviar a Telegram o pedir activar bridge:

```typescript
baileysClient.setIncomingMediaHandler(async (base64, mimetype, sender, caption, fileName, duration, isSticker) => {
  if (telegramBridgeService.isActive(sender)) {
    await telegramBridgeService.sendMediaToTelegram(sender, base64, mimetype, caption, fileName, isSticker);
    await whatsappService.sendMessage(sender, "✅ Media enviado al grupo");
  } else {
    await whatsappService.sendMessage(sender, "📨 Envia un mensaje para activar el bridge antes de compartir medios.");
  }
});
```

Tipos de media soportados desde WhatsApp:
- Imagen (`image/*`)
- Audio / Voice (`audio/*`)
- Video (`video/*`)
- Sticker (`image/webp`)
- Otros → enviado como documento

### Media Telegram → WhatsApp

`TelegramClient` detecta automáticamente el tipo de media y la descarga a base64:

| Tipo detectado | MIME enviado | Icono en WhatsApp |
|---|---|---|
| `photo` | `image/jpeg` | 📷 |
| `audio` / `voice` | `audio/ogg` | 🎵 |
| `video` / `video_note` / `animation` | `video/mp4` | 🎥 |
| `sticker` (WebP) | `image/webp` + isSticker | 🎨 |
| `sticker` animado | — | ❌ notificación |
| `document` | según tipo | 📄 |

---

## Estados de Bridge

```typescript
// Estado en ConversationStateMachine
{ context: "bridge::active", data: {} }

// Verificación en TelegramBridgeService
telegramBridgeService.isActive(sender)  // true si está en modo bridge
telegramBridgeService.enterBridge(sender)
telegramBridgeService.exitBridge(sender)
```

El sender permanece en modo bridge hasta que:
- Envía `menu`, `0`, `inicio`, `salir`
- El mensaje no se recibe por 15 min (sesión zombie expira)

---

## Comportamiento por tipo de mensaje

### WhatsApp → Telegram

- **Texto:** se reenvía con `👤 Nombre: texto`
- **Texto con reply:** se reenvía con la cadena de reply quoteada
- **Media:** se reenvía con caption `👤 Nombre: caption` o `👤 Nombre` si no tiene
- **Sticker:** se reenvía como sticker
- **Respuesta:** "✅ Mensaje enviado al grupo" / "✅ Media enviado al grupo"

### Telegram → WhatsApp

- **Texto:** se reenvía a todas las sesiones activas
- **Media:** se reenvía a todas las sesiones activas
- **Reply:** se incluye `↪️ Respondió a [Autor]` antes del contenido
- **Broadcast:** si hay N sesiones activas, todos reciben el mensaje

---

## Configuración

```env
BRIDGE_BOT_TOKEN=1234567890:ABCdefGHIjklmNOPqrSTUvwxYZ
TELEGRAM_GROUP_ID=-1001234567890
BRIDGE_AUTHORIZED_WPP_IDS=573001234567,573009876543
```

| Variable | Descripción |
|---|---|
| `BRIDGE_BOT_TOKEN` | Token del bot de Telegram (de @BotFather) |
| `TELEGRAM_GROUP_ID` | ID numérico del grupo de Telegram |
| `BRIDGE_AUTHORIZED_WPP_IDS` | IDs de WhatsApp autorizados (separados por coma o JSON array) |

Si `BRIDGE_BOT_TOKEN` está vacío o `TELEGRAM_GROUP_ID` es 0, el bridge no se inicializa.

Ver `docs/env.md` para todas las variables.
