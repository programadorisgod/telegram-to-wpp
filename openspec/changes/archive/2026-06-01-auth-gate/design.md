# Design: Auth Gate & Branding

## Technical Approach

Guard every incoming WhatsApp message against `BOT_AUTHORIZED_CHAT_ID` at the top of `MessageHandler.handle()`, before the state machine or any domain code executes. Unauthorized senders get only the welcome message and a warn log — no menu exposure, no state mutation, no data access. Branding strings rename "DCM Bot" → "Astral Bot" across four surfaces. Both changes are purely additive/rename with zero behavioral impact on authorized flows.

## Architecture Decisions

### 1. Optional env var with empty-string normalization

| Option | Decision |
|--------|----------|
| `.optional()` in Zod, `!val` guard at usage | **Chosen** |
| `.default("")` + explicit comparison | Rejected — conflates "not set" with "empty" |

**Why**: `.optional()` cleanly separates "var is absent" (undefined) from "var is present". But Zod treats `""` as a provided value when the var is set to empty. The guard `if (!this.authorizedChatId)` at the usage site normalizes both `undefined` and `""` into kiosk mode — so an operator who accidentally sets `BOT_AUTHORIZED_CHAT_ID=""` gets safe behavior instead of authorizing everyone.

### 2. Auth gate before state machine

**Why**: Unauthorized senders must never reach the state machine (no `getState()` call), menu rendering, DCM controller, or use cases. Placing the gate first makes this guarantee structural — not a convention you can forget. Single return point for all unauthorized paths.

### 3. Warn-level logging for unauthorized access

**Why**: Unauthorized access is notable but not an error — kiosk mode is a valid operational state. `console.warn()` with the sender chat ID makes it visible in logs without triggering alerting systems.

### 4. No auth on `editMessage`

**Why**: `editMessage` is called exclusively by the bot itself to update its own outgoing messages (e.g. replacing a "loading..." placeholder with the final response). These carry no sender context and are never triggered by incoming user messages.

### 5. No rate limiting

**Why**: Single-user bot design. Auth check is O(1) string comparison. Rate limiting adds complexity with zero measurable benefit at this scale.

## Data Flow

```
WhatsApp ──→ BaileysClient ──→ MessageHandler.handle(text, sender)
                                    │
                              ┌─────┴─────┐
                              │  AUTH GATE │
                              │            │
                              │  if (!authorizedChatId) ───────┐
                              │    warn(`Unauthorized: ${sender}`) │
                              │    sendMessage(sender, welcome)   │
                              │    return                         │
                              │            │
                              │  if (sender !== authorizedChatId) │
                              │    warn(...)                      │
                              │    sendMessage(...)               │
                              │    return                         │
                              └─────┬─────┘
                                    │ (authorized)
                                    ▼
                         stateMachine.getState(sender)
                                    │
                                    ▼
                         routeCommand(...) / dcmController
```

## File Changes

### 1. `src/infrastructure/config/env.ts`

**What**: Add two Zod fields to the schema.

| Field | Schema | Behavior |
|-------|--------|----------|
| `BOT_AUTHORIZED_CHAT_ID` | `z.string().optional()` | `undefined` when absent, `string` when set |
| `BOT_WELCOME_MESSAGE` | `z.string().default("Bienvenido a Astral bot")` | Default applies only when var is absent, not when empty |

**Why**: Keep kiosk mode as the safe default. The default welcome makes the new bot discoverable out of the box.

### 2. `src/interface/whatsapp/MessageHandler.ts`

**What**: Add `authorizedChatId: string | undefined` and `welcomeMessage: string` to the constructor. Insert auth gate as the first statement in `handle()`, before `normalizedText` and `getState()`.

**How**:
```typescript
constructor(
    private whatsappService: IWhatsAppService,
    private menuService: DCMenuService,
    private stateMachine: ConversationStateMachine,
    private dcmController: DCMController,
    private authorizedChatId: string | undefined,
    private welcomeMessage: string,
) {}

async handle(text: string, sender: string): Promise<void> {
    // ── Auth gate ──────────────────────────────────────────────
    if (!this.authorizedChatId || sender !== this.authorizedChatId) {
        console.warn(`[AUTH] Unauthorized access from ${sender}`);
        await this.whatsappService.sendMessage(sender, this.welcomeMessage);
        return;
    }

    const normalizedText = text.trim().toLowerCase();
    const state = this.stateMachine.getState(sender);
    // ... rest unchanged
```

**Why** `!this.authorizedChatId` covers three cases in one expression: `undefined` (var absent), `null` (not possible with Zod but defensive), and `""` (var present but empty). The `||` short-circuits on falsy, so kiosk mode never evaluates the sender comparison.

### 3. `src/main.ts`

**What**:
- Pass `env.BOT_AUTHORIZED_CHAT_ID` and `env.BOT_WELCOME_MESSAGE` to MessageHandler constructor
- Change `<title>` from `"DCM Bot — Conexión WhatsApp"` → `"Astral Bot — Conexión WhatsApp"`
- Change `<h1>` from `"📱 DCM Bot"` → `"📱 Astral Bot"`
- Change console startup log from `"🚀 Iniciando DCM Chatbot..."` → `"🚀 Iniciando Astral Bot..."`

**Why**: Constructor injection keeps the handler pure — no implicit env coupling.

### 4. `src/interface/whatsapp/DCMenuService.ts`

**What**:
- `mainMenu()`: `"👗 *DCM - Asistente de Confección*"` → `"👗 *Astral Bot - Asistente de Confección*"`
- `helpMenu()`: `"📚 *Ayuda - DCM Asistente*"` → `"📚 *Ayuda - Astral Bot*"`

**Why**: Pure string changes. The bot maintains its role as "Asistente de Confección" — only the brand name changes.

### 5. `.env.example`

**What**: Add commented section:
```bash
# ── Bot auth ──────────────────────────────────────────────
# Leave unset for kiosk mode (all users get welcome message)
BOT_AUTHORIZED_CHAT_ID=
BOT_WELCOME_MESSAGE="Bienvenido a Astral bot"
```

**Why**: The comments clarify the kiosk-mode behavior at a glance. The empty value for `BOT_AUTHORIZED_CHAT_ID` visually signals "not set".

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong chat ID format in env | Low | IDs are stable strings — operator copies from bot's own logs |
| Welcome-spam on rapid unauthorized msgs | Low | By design — no state stored per unauthorized sender |
| `BOT_AUTHORIZED_CHAT_ID` set to `""` | Low | `!authorizedChatId` normalizes to kiosk mode (safe default) |
| Forgot to set env var in production | Low | Kiosk mode is a safe default — no data exposure |

## Verification Plan

Since the project has no test framework configured, verification is manual via `tsc --noEmit` + smoke testing:

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Kiosk mode | Remove `BOT_AUTHORIZED_CHAT_ID` from `.env`, restart | All messages get welcome, no commands work |
| 2 | Authorized | Set valid chat ID, restart | Full menu, all commands work |
| 3 | Unauthorized | Set different chat ID, send message from wrong number | Welcome only, warn log with sender ID |
| 4 | Empty welcome | Set `BOT_WELCOME_MESSAGE=""` | Empty string sent (no crash) |
| 5 | Branding | Visual check | QR page, console, menu headers show "Astral Bot" |
| 6 | Compilation | `tsc --noEmit` | Zero errors |
