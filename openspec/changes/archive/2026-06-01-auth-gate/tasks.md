# Tasks: Auth Gate & Branding

## Task 1: Add Env Vars

**Files**: `src/infrastructure/config/env.ts`, `.env.example`

**Acceptance**: Two new Zod fields pass validation; `.env.example` documents both with comments explaining kiosk mode.

### Steps

1. **`src/infrastructure/config/env.ts`** — Add after `API_BASE_URL` (line 21):
   - `BOT_AUTHORIZED_CHAT_ID: z.string().optional()`
   - `BOT_WELCOME_MESSAGE: z.string().default("Bienvenido a Astral bot")`

2. **`.env.example`** — Add at the end:
   ```bash
   # ── Bot auth ──────────────────────────────────────────────
   # Leave unset for kiosk mode (all users get welcome message)
   BOT_AUTHORIZED_CHAT_ID=
   BOT_WELCOME_MESSAGE="Bienvenido a Astral bot"
   ```

---

## Task 2: Auth Gate in MessageHandler

**Files**: `src/interface/whatsapp/MessageHandler.ts`

**Acceptance**: Auth gate sits as the first statement in `handle()`; unauthorized senders receive welcome message + warn log and are rejected before any state machine or routing code executes.

### Steps

1. **Add constructor params** (line 7-12):
   ```typescript
   constructor(
       private whatsappService: IWhatsAppService,
       private menuService: DCMenuService,
       private stateMachine: ConversationStateMachine,
       private dcmController: DCMController,
       private authorizedChatId: string | undefined,
       private welcomeMessage: string,
   ) {}
   ```

2. **Insert auth gate at top of `handle()`** (before `normalizedText`, after `async handle(text: string, sender: string): Promise<void> {`):
   ```typescript
       // ── Auth gate ──────────────────────────────────────────────
       if (!this.authorizedChatId || sender !== this.authorizedChatId) {
           console.warn(`[AUTH] Unauthorized access from ${sender}`);
           await this.whatsappService.sendMessage(sender, this.welcomeMessage);
           return;
       }
   ```
   - `!this.authorizedChatId` normalizes `undefined`, `null`, and `""` → kiosk mode
   - Second condition catches mismatched sender
   - Short-circuit `||` means when kiosk mode is active, sender comparison never evaluates

---

## Task 3: Wire in main.ts + Rename Branding

**Files**: `src/main.ts`, `src/interface/whatsapp/DCMenuService.ts`

**Acceptance**: Env vars injected into MessageHandler; all user-visible "DCM Bot" / "DCM" references changed to "Astral Bot".

### Steps

1. **`src/main.ts` — Wire env vars** (lines 53-58): Pass new params to `MessageHandler` constructor:
   ```typescript
   this.messageHandler = new MessageHandler(
       this.whatsappService,
       dcmMenuService,
       stateMachine,
       dcmController,
       env.BOT_AUTHORIZED_CHAT_ID,
       env.BOT_WELCOME_MESSAGE,
   );
   ```

2. **`src/main.ts` — QR page title** (line 97): Change `<title>DCM Bot — Conexión WhatsApp</title>` → `<title>Astral Bot — Conexión WhatsApp</title>`

3. **`src/main.ts` — QR page h1** (line 157): Change `<h1>📱 DCM Bot</h1>` → `<h1>📱 Astral Bot</h1>`

4. **`src/main.ts` — Startup log** (line 211): Change `'🚀 Iniciando DCM Chatbot...'` → `'🚀 Iniciando Astral Bot...'`

5. **`src/interface/whatsapp/DCMenuService.ts` — mainMenu() header** (line 30): Change `"👗 *DCM - Asistente de Confección*"` → `"👗 *Astral Bot - Asistente de Confección*"`

6. **`src/interface/whatsapp/DCMenuService.ts` — helpMenu() header** (line 59): Change `"📚 *Ayuda - DCM Asistente*"` → `"📚 *Ayuda - Astral Bot*"`

---

## Task 4: Verify

**Files**: All changed files

**Acceptance**: `tsc --noEmit` passes with zero errors; manual review confirms every change matches spec.

### Steps

1. Run `tsc --noEmit` and verify zero compilation errors
2. Cross-check against spec scenarios:
   - ✅ Authorized sender proceeds to normal routing
   - ✅ Unauthorized sender gets welcome message + warn log
   - ✅ Kiosk mode (no `BOT_AUTHORIZED_CHAT_ID`) sends welcome to all
   - ✅ Empty `BOT_WELCOME_MESSAGE=""` sends empty string (no crash)
   - ✅ All branding shows "Astral Bot" (QR page, console, menus)
   - ✅ NF4: System starts with or without `BOT_AUTHORIZED_CHAT_ID`
3. Verify `editMessage` is NOT auth-gated (it has no sender context — bot's own outgoing edits)
