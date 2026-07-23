# Delta Spec — Auth Gate & Branding

## Purpose

Restrict bot access to a single authorized WhatsApp user and rename branding from "DCM Bot" to "Astral Bot". Unauthorized senders receive only a welcome message — no state, no commands, no data exposure.

## ADDED Requirements

### R1: Authorization Gate

The system MUST validate every incoming message sender against `BOT_AUTHORIZED_CHAT_ID` at the top of `MessageHandler.handle()`, before any state machine or routing logic executes.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1.1 | Authorized user | `BOT_AUTHORIZED_CHAT_ID` is set and sender matches it | sender sends any message | system proceeds to normal routing |
| 1.2 | Unauthorized user | `BOT_AUTHORIZED_CHAT_ID` is set and sender does NOT match | sender sends any message | system sends welcome message and returns |
| 1.3 | Auth from nav command | unauthorized sender sends "menu" or "1" | sender sends any command | same behavior as 1.2 — welcome message only |

### R2: Kiosk Mode

When `BOT_AUTHORIZED_CHAT_ID` is not set (null/undefined), the system MUST treat ALL senders as unauthorized.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2.1 | No auth configured | `BOT_AUTHORIZED_CHAT_ID` is absent | any sender sends a message | system sends welcome message and returns |
| 2.2 | Repeat messages in kiosk | same sender messages multiple times without auth | each message arrives | each gets welcome — no state is persisted per sender |

### R3: Welcome Message

The system MUST use `BOT_WELCOME_MESSAGE` as the response text for unauthorized senders. The env field SHOULD have a `Zod.default("Bienvenido a Astral bot")`. If set to empty string `""`, the system SHALL send an empty string — the operator explicitly configured it that way; no fallback to default occurs.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3.1 | Default message | env has no `BOT_WELCOME_MESSAGE` | unauthorized message received | response is "Bienvenido a Astral bot" |
| 3.2 | Custom message | env has `BOT_WELCOME_MESSAGE="Custom"` | unauthorized message received | response is "Custom" |
| 3.3 | Empty message | env has `BOT_WELCOME_MESSAGE=""` | unauthorized message received | system sends empty string (no crash) |

### R4: Access Logging

The system MUST log every unauthorized access attempt at `warn` level including the sender chat ID.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4.1 | Unauthorized attempt | env var set, wrong sender | system processes message | log includes `sender` at `warn` level |
| 4.2 | Kiosk attempt | no auth configured | any message arrives | log includes `sender` at `warn` level |

### R5: Branding — "Astral Bot"

All user-visible instances of "DCM Bot" MUST be replaced with "Astral Bot".

| # | Location | Current | Required |
|---|----------|---------|----------|
| 5.1 | QR page `<title>` | `DCM Bot — Conexión WhatsApp` | `Astral Bot — Conexión WhatsApp` |
| 5.2 | QR page `<h1>` | `📱 DCM Bot` | `📱 Astral Bot` |
| 5.3 | QR page `.subtitle` | `Escanea el código QR con WhatsApp para conectar` | *(unchanged)* |
| 5.4 | Console startup log | `🚀 Iniciando DCM Chatbot...` | `🚀 Iniciando Astral Bot...` |
| 5.5 | `mainMenu()` header | `👗 *DCM - Asistente de Confección*` | `👗 *Astral Bot - Asistente de Confección*` |
| 5.6 | `helpMenu()` header | `📚 *Ayuda - DCM Asistente*` | `📚 *Ayuda - Astral Bot*` |

## MODIFIED Requirements

### R6: Client Management — Authorization Dependency

(Previously: Submenu Navigation had no auth precondition — the menu was reachable by any sender)

The client management subsystem MUST be reachable only after the authorization gate passes. All scenarios under Client Management (Submenu Navigation, Create, List, View Detail, Update, Delete, API Error Handling) implicitly require "sender is authorized" as a precondition. The auth gate SHALL reject unauthorized senders before any client management code is reached.

No behavioral changes to existing client management scenarios — the gate is an earlier rejection layer, not a modification to CRUD logic.

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Security | The system MUST NOT expose menu options, client data, or state machine context to unauthorized senders under any code path |
| NF2 | Logging | Unauthorized access MUST be logged at `warn` level with `sender` attribute |
| NF3 | Performance | Auth check is a single string comparison — MUST complete in <1ms and MUST NOT add measurable latency |
| NF4 | Startup | The system MUST start successfully with or without `BOT_AUTHORIZED_CHAT_ID` |
| NF5 | Correctness | `tsc --noEmit` MUST pass after all changes |

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty `BOT_WELCOME_MESSAGE=""` | System sends empty string — no crash, no fallback. Operator explicitly configured it this way. |
| Sender ID format | Comparison is raw string equality. Baileys chat IDs are stable strings (`{number}@s.whatsapp.net`). |
| Concurrent unauthorized messages | Auth gate has no shared state — no race condition, no locking needed. |
| Authorized user after prior unauthorized | Authorization is per-message. There is no session or cooldown. |
| `BOT_AUTHORIZED_CHAT_ID` set but empty string | Zod `.optional()` treats `""` as a provided value. If the env var is present but empty, it will be `""`. The comparison `sender !== ""` would pass for any real sender, effectively making everyone authorized if empty. Documented risk: operator should NOT set the var to empty; remove it entirely for kiosk mode. |
