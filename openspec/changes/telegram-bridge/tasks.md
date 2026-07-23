# Tasks: Telegram Bridge

## Phase 1: Foundation

- [x] 1.1 Create `packages/telegram-core/package.json` — mirror whatsapp-core pattern, add `telegraf` v4 dependency
- [x] 1.2 Create `packages/telegram-core/tsconfig.json` — extend root, strict mode, ES2022, CommonJS, declaration
- [x] 1.3 Create `packages/telegram-core/src/types.ts` — `TelegramConfig` interface (`botToken`, `groupId`, `authorizedIds`)
- [x] 1.4 Create `packages/telegram-core/src/ports/ITelegramService.ts` — port with `sendMessage(chatId, text): Promise<void>`
- [x] 1.5 Add 3 env vars to `src/infrastructure/config/env.ts` via Zod: `BRIDGE_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, `BRIDGE_AUTHORIZED_WPP_IDS`
- [x] 1.6 Run `pnpm install` to install `telegraf` in workspace

## Phase 2: Core Implementation

- [x] 2.1 Create `packages/telegram-core/src/client/TelegramClient.ts` — Telegraf polling wrapper, group message listener with callback
- [x] 2.2 Create `packages/telegram-core/src/services/BridgeTelegramService.ts` — `ITelegramService` impl delegating to `TelegramClient`
- [x] 2.3 Create `packages/telegram-core/src/index.ts` — re-export `TelegramConfig`, `ITelegramService`, `BridgeTelegramService`, `TelegramClient`
- [x] 2.4 Create `src/application/services/TelegramBridgeService.ts` — `Set`-based active session manager, `sendToTelegram()` / `sendToWhatsApp()` with dedup

## Phase 3: Integration

- [x] 3.1 Create `src/interface/whatsapp/features/telegram/BridgeFeature.ts` — `BotFeature` impl with "Chat Telegram" menu entry and `bridge::active` state handling
- [x] 3.2 Modify `src/interface/whatsapp/MessageHandler.ts` — intercept `bridge::active` context before routing; trap `menu`/`0`/`inicio` to exit mode
- [x] 3.3 Wire in `src/main.ts` — init `TelegramClient`, construct `TelegramBridgeService` + `BridgeFeature`, register TG → WPP message handler

## Phase 4: Verification

- [x] 4.1 Run `tsc --noEmit` and fix all type errors across changed files

## Fixes: Auth Gating & Graceful Degradation

- [x] F.1 Make bridge env vars optional in `env.ts` — `BRIDGE_BOT_TOKEN` defaults to `""`, `TELEGRAM_GROUP_ID` defaults to `0`
- [x] F.2 Add `authorizedIds: Set<string>` constructor param to `BridgeFeature` — rejects unauthorized users in `handleSubmenuCommand` with "No autorizado" message
- [x] F.3 Wrap bridge initialization in `main.ts` with `if (env.BRIDGE_BOT_TOKEN && env.TELEGRAM_GROUP_ID > 0)` — graceful fallback with warning log, BridgeFeature excluded from features array when disabled
- [x] F.4 Parse `BRIDGE_AUTHORIZED_WPP_IDS` → `Set<string>` in `main.ts` and pass to `BridgeFeature`

## Dependencies (pre-flight)

- Telegram bot token from [@BotFather](https://t.me/BotFather) (user must create before verification)
- Telegram group ID (user must obtain via `getUpdates` or invite bot to group first)
