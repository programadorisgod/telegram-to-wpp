# Design: Telegram Bridge

## Technical Approach

Add a `BridgeFeature` (BotFeature impl) that lets authorized WPP users enter a bridge mode. While active, every message forwards to a Telegram group via a new `@task-bot/telegram-core` package wrapping Telegraf (polling). Telegram messages broadcast back to all active bridge sessions. Follows existing DCMFeature and whatsapp-core patterns exactly — same interface, same DI wiring in `main.ts`.

## Architecture Decisions

### Decision: New package vs inline Telegraf usage

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline Telegraf in src/ | Less boilerplate, but breaks hexagonal symmetry with whatsapp-core | Rejected |
| `@task-bot/telegram-core` | Mirrors existing package structure, clean port/adapter separation, testable | **Chosen** |

### Decision: Polling vs webhook

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Webhook | Needs Express route; conflicts with existing server port; requires public HTTPS URL | Rejected |
| Polling | Telegraf `launch()` runs alongside Express; no port conflict; no public URL needed | **Chosen** |

### Decision: Bridge state management

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Store in ConversationStateMachine | Already manages `bridge::active` context; no new state store | **Chosen** |
| Separate Set in TelegramBridgeService | Duplicates state, must sync; but needed for broadcast targeting | Hybrid — **CSM owns context**, TBS owns a `Set<string>` of active sender IDs for O(1) broadcast |

### Decision: Bridge interceptor in MessageHandler

Adding a bridge check before the global nav commands (menu/0/inicio) ensures exit commands are **never** forwarded. The bridge state (`bridge::active`) is a `BotFeature` namespace, but MessageHandler intercepts it early rather than routing through the normal feature pipeline, because the feature doesn't own submenu commands — it owns ALL user input.

## Data Flow

### WPP → Telegram

    WPP User → MessageHandler
        │ state = "bridge::active"
        │ text ≠ menu/0/inicio
        ▼
    TelegramBridgeService.sendToTelegram(sender, text)
        │ lookup sender name from WPP
        ▼
    TelegramClient (Telegraf) → Telegram Group
        "👤 Nombre: mensaje"

### Telegram → WPP

    Telegram Group → TelegramClient.onMessage(callback)
        ▼
    TelegramBridgeService.sendToWhatsApp(text, fromName)
        │ iterate Set<string> of active sender IDs
        ▼
    WhatsAppService.sendMessage(activeId, "👤 N: mensaje")
        for each active session

### Bridge Entry/Exit

    WPP User sends "1" at main menu
        → BridgeFeature.handleSubmenuCommand("1")
        → CSM.setState("bridge::active")
        → "Estás en modo bridge"
    
    WPP User sends "menu" while bridge::active
        → MessageHandler intercepts before routeCommand
        → CSM.setState("main")
        → sendAggregatedMenu(sender)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/telegram-core/package.json` | Create | `@task-bot/telegram-core`, dep: `telegraf` |
| `packages/telegram-core/tsconfig.json` | Create | Extends root, outDir `./dist` |
| `packages/telegram-core/src/index.ts` | Create | Re-exports `ITelegramService`, `TelegramClient`, `TelegramConfig` |
| `packages/telegram-core/src/types.ts` | Create | `TelegramConfig` — botToken, groupId |
| `packages/telegram-core/src/ports/ITelegramService.ts` | Create | `sendToGroup(text): Promise<void>` |
| `packages/telegram-core/src/client/TelegramClient.ts` | Create | Telegraf polling wrapper, `onMessage(cb)`, `sendToGroup(text)` |
| `src/interface/whatsapp/features/telegram/index.ts` | Create | Re-exports BridgeFeature |
| `src/interface/whatsapp/features/telegram/BridgeFeature.ts` | Create | BotFeature impl — adds "Chat Telegram" menu entry, `handleSubmenuCommand("1")` sets `bridge::active` |
| `src/application/services/TelegramBridgeService.ts` | Create | Set of active senders, `sendToTelegram()`, `sendToWhatsApp()` |
| `src/infrastructure/config/env.ts` | Modify | Add `BRIDGE_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, `BRIDGE_AUTHORIZED_WPP_IDS` (all optional, bridge disabled if any missing) |
| `src/interface/whatsapp/MessageHandler.ts` | Modify | Before global nav check: if state is `bridge::active` and text is exit cmd → exit; else forward to TBS |
| `src/main.ts` | Modify | Init TelegramClient, TelegramBridgeService, BridgeFeature; conditional on env vars; register in features array |

## Interfaces / Contracts

```typescript
// packages/telegram-core/src/ports/ITelegramService.ts
export interface ITelegramService {
  sendToGroup(text: string): Promise<void>;
}

// packages/telegram-core/src/types.ts
export interface TelegramConfig {
  botToken: string;
  groupId: string;
}
```

## Testing Strategy

No test framework exists in the project (config.yaml confirms). Quality is enforced via `tsc --noEmit`. Manual verification described in spec scenarios.

## Migration / Rollout

No migration required. Bridge is opt-in: missing env vars disable the feature gracefully with a warning log. Rollback plan in proposal covers full reversal.

## Open Questions

None — all decisions resolved in proposal and spec.
