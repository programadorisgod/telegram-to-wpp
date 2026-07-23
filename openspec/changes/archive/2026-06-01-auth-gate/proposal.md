# Proposal: Auth Gate

## Intent

Restrict bot access to a single authorized WhatsApp user via `BOT_AUTHORIZED_CHAT_ID`. Unauthorized senders receive a welcome message only — no state, no commands, no data exposure.

## Scope

### In Scope
1. `BOT_AUTHORIZED_CHAT_ID` (required, fail-fast) and `BOT_WELCOME_MESSAGE` (default "Bienvenido a Astral bot") in env.ts
2. Auth gate at the top of `MessageHandler.handle()` — check sender, return welcome if unauthorized
3. Inject env vars into `MessageHandler` from `main.ts`
4. Rename branding: "DCM Bot" → "Astral Bot" in QR page, console logs, DCMenuService headers
5. Log unauthorized access attempts with sender chat ID
6. Update `.env.example`

### Out of Scope
- Feature registry / multi-feature architecture (Phase 2 — future)
- Tasks feature (Phase 3 — future)
- Rich formatting for welcome message
- Any state machine interaction for unauthorized users

## Capabilities

### New Capabilities
- `auth-gate`: Authorization gate for WhatsApp messages — validates sender against `BOT_AUTHORIZED_CHAT_ID`, responds with welcome message to unauthorized senders, logs access attempts

### Modified Capabilities
- `client-management`: Now requires passing the auth gate first. No behavioral changes to the feature itself.

## Approach

1. **env.ts**: Add `BOT_AUTHORIZED_CHAT_ID` (`.optional()`, nullable string) and `BOT_WELCOME_MESSAGE` (`.default("Bienvenido a Astral bot")`)
2. **MessageHandler**: Accept `authorizedChatId` (nullable) and `welcomeMessage` in constructor. At the top of `handle()`:
   - If `authorizedChatId` is empty/null → everyone is unauthorized → send welcome, return
   - If `sender !== authorizedChatId` → unauthorized → send welcome, return, log
   - Otherwise → proceed with full functionality
3. **main.ts**: Pass `env.BOT_AUTHORIZED_CHAT_ID` and `env.BOT_WELCOME_MESSAGE` to MessageHandler
4. **DCMenuService**: Rename headers from "DCM" to "Astral Bot" in `mainMenu()` and `helpMenu()`
5. **QR page**: Change title, h1, subtitle from "DCM Bot" to "Astral Bot"
6. **Console logs**: Update startup message and feature logs in `main.ts`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/config/env.ts` | Modified | +2 Zod fields |
| `src/interface/whatsapp/MessageHandler.ts` | Modified | +auth gate, +2 constructor params |
| `src/main.ts` | Modified | Inject env vars, rename logs + QR page |
| `src/interface/whatsapp/DCMenuService.ts` | Modified | Rename headers to "Astral Bot" |
| `.env.example` | Modified | Add BOT_AUTHORIZED_CHAT_ID + BOT_WELCOME_MESSAGE |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong chat ID format | Low | Chat IDs are stable strings — user copies from bot's own logs |
| Welcome message spam on every unauthorized msg | Low | By design — no state stored for unauthorized users |
| Forgot to set env var in production | Low | Bot runs in welcome-only mode (safe default) |

## Rollback Plan

Revert git changes on this branch. Auth gate is a small, isolated diff — no migrations or data to roll back.

## Dependencies

None.

## Success Criteria

- [ ] If `BOT_AUTHORIZED_CHAT_ID` is not set, all users get welcome message only (kiosk mode)
- [ ] Authorized sender sees full bot functionality (menu, DCM commands)
- [ ] Unauthorized sender receives welcome message only
- [ ] Unauthorized access attempts logged with sender chat ID
- [ ] All visible branding shows "Astral Bot" (QR page, console logs, menu headers)
- [ ] `tsc --noEmit` passes after all changes
