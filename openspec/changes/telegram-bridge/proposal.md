# Proposal: Telegram Bridge

## Intent

Authorized WhatsApp users can chat bidirectionally with a Telegram group, bridging the two platforms. The business needs a single chat channel where the team communicates via Telegram while the WhatsApp customer-facing bot participates.

## Scope

### In Scope
- New `@task-bot/telegram-core` package mirroring `whatsapp-core` patterns
- `BridgeFeature` (BotFeature implementation) — menu entry, bridge mode state
- `TelegramBridgeService` — manages active bridge sessions, routing WPP→TG and TG→WPP
- New env vars: `BRIDGE_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, `BRIDGE_AUTHORIZED_WPP_IDS`
- Modify `MessageHandler` to intercept bridge context and forward messages
- Init `TelegramClient` in `main.ts` alongside BaileysClient

### Out of Scope
- Modifying the existing Telegram bot at `/home/camidev/projects/TelegramBot/`
- Webhook mode (will use polling to avoid port/route conflicts)
- Rich media forwarding (images, documents — text-only for v1)
- Multi-group support (single Telegram group only)
- Persistent bridge session history

## Capabilities

### New Capabilities
- `telegram-bridge`: Covers bridge mode activation from WhatsApp menu, forwarding WPP messages to Telegram group, broadcasting Telegram messages to all active WPP sessions, and authorized-user gating.

### Modified Capabilities
- None — `BridgeFeature` uses the existing `BotFeature` interface; no spec-level contract changes.

## Approach

1. **New package**: `packages/telegram-core/` — `TelegramClient` (Telegraf polling), `ITelegramService` port, `BridgeTelegramService` impl, `TelegramConfig` type.
2. **BridgeFeature** in `src/interface/whatsapp/features/telegram/` — adds "Chat Telegram" menu entry, `bridge::active` state. `handleSubmenuCommand("1")` enters bridge mode.
3. **TelegramBridgeService** in `src/application/services/` — maintains `Set<string>` of active WPP senders. `sendToTelegram(wppSender, text)` forwards to group. `sendToWhatsApp(telegramGroupId, text, fromName)` broadcasts to all active sessions with `👤 Nombre: mensaje` prefix.
4. **MessageHandler** modification — before routing, check if context is `bridge::active`. If so, intercept `menu`/`0`/`inicio` to exit bridge mode, otherwise forward to TelegramBridgeService.
5. **main.ts** — init `TelegramClient`, wire `TelegramBridgeService` + `BridgeFeature`, pass TelegramClient to listen for TG→WPP messages.
6. Polling mode (no Express route needed) — Telegraf `launch()` alongside existing HTTP server.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/telegram-core/` | New | Full package: client, ports, services, types |
| `src/interface/whatsapp/features/telegram/BridgeFeature.ts` | New | BotFeature impl for bridge mode |
| `src/application/services/TelegramBridgeService.ts` | New | Session set, WPP↔TG routing |
| `src/infrastructure/config/env.ts` | Modified | 3 new env vars via Zod schema |
| `src/interface/whatsapp/MessageHandler.ts` | Modified | Bridge context interceptor before routing |
| `src/main.ts` | Modified | Telegram client init, feature registration |
| `pnpm-workspace.yaml` | Modified | No change needed (already globs `packages/*`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Telegram bot token leaks via env | Low | Already using `.env` pattern; `.gitignore` covers it |
| Telegram polling conflicts if existing bot shares same group | Low | New bot = new token; Telegram allows multiple bots per group |
| WPP user stuck in bridge mode with no exit | Low | `menu`/`0`/`inicio` always intercepted at MessageHandler level |
| BridgeTelegramService sends duplicate messages | Med | Track message IDs or dedupe with a small LRU cache |

## Rollback Plan

1. Remove `BridgeFeature` from the features array in `main.ts`
2. Remove `TelegramClient` initialization in `main.ts`
3. Revert `MessageHandler.ts` — remove bridge context check
4. Revert `env.ts` — remove 3 bridge env vars
5. Delete `packages/telegram-core/` directory
6. Delete `src/interface/whatsapp/features/telegram/` directory
7. Delete `src/application/services/TelegramBridgeService.ts`
8. Run `pnpm install` to update lockfile

## Dependencies

- `telegraf` npm package (v4.x, latest) — to be added to `packages/telegram-core/package.json`
- New Telegram bot token from @BotFather (user must create before implementation)
- Telegram group chat ID (user must obtain via existing bot or `getUpdates`)

## Success Criteria

- [ ] Authorized WPP user sees "Chat Telegram" in main menu
- [ ] Selecting it enters bridge mode; messages are forwarded to Telegram group
- [ ] Messages from Telegram group appear on WPP from ALL active bridge sessions
- [ ] Typing `menu`/`0`/`inicio` exits bridge mode (those messages NOT forwarded)
- [ ] Unauthorized WPP IDs cannot access bridge mode
- [ ] `tsc --noEmit` passes with zero errors
