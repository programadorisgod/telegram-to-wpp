# Telegram Core — Plan

## Objetivo

Crear un paquete compartido `@task-bot/telegram-core` (en `packages/telegram-core/`) que encapsule la conexión, autenticación, envío y recepción de mensajes vía Telegram.

Mismo patrón que `whatsapp-core`: **cero lógica de dominio**, solo infraestructura desacoplada.

## Estructura

```
packages/telegram-core/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  # barrel export
    ├── ports/
    │   ├── ITelegramService.ts   # sendMessage(to, message)
    │   └── IMessageHandler.ts    # callback (text, sender) => void
    ├── types.ts                  # TelegramConfig { botToken }
    └── client/
        └── TelegramBotClient.ts  # conexión, polling, eventos
```

## Interfaces

### ITelegramService.ts
```typescript
export interface ITelegramService {
  sendMessage(to: string, message: string): Promise<void>;
}
```

### IMessageHandler.ts
```typescript
export interface IMessageHandler {
  handle(text: string, sender: string): Promise<void>;
}
```

### TelegramConfig (types.ts)
```typescript
export interface TelegramConfig {
  botToken: string;
}
```

## Dependencia externa

Pendiente de definir la librería:
- `node-telegram-bot-api` — simple, clásica
- `grammy` — moderna, modular

Se agrega como dependencia del paquete en `package.json`.

## Uso esperado desde una app

```typescript
import { TelegramBotClient, TelegramService } from "@task-bot/telegram-core";
import { MyMessageHandler } from "./MyMessageHandler";

const bot = new TelegramBotClient({ botToken: env.TELEGRAM_BOT_TOKEN });
const service = new TelegramService();
service.setMessageSender((to, msg) => bot.sendMessage(to, msg));

const handler = new MyMessageHandler(service);
bot.setMessageHandler(handler);

await bot.initialize();
```

## Pendientes antes de implementar

1. Elegir librería (`node-telegram-bot-api` vs `grammy`)
2. Definir cómo manejar groups/channels en Telegram
3. Decidir si incluir soporte para botones inline (KeyboardMarkup)
