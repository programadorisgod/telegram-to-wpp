# Authorization & Access Control Specification

## Purpose

Define the authorization gate, kiosk mode, welcome message, access logging, and branding behavior for the WhatsApp bot. These requirements govern the entry point of all incoming messages — before any domain-specific logic executes.

## Requirements

### Requirement: Authorization Gate

The system MUST validate every incoming message sender against `BOT_AUTHORIZED_CHAT_ID` at the top of `MessageHandler.handle()`, before any state machine or routing logic executes.

#### Scenario: Authorized user
- GIVEN `BOT_AUTHORIZED_CHAT_ID` is set and sender matches it
- WHEN sender sends any message
- THEN system proceeds to normal routing

#### Scenario: Unauthorized user
- GIVEN `BOT_AUTHORIZED_CHAT_ID` is set and sender does NOT match
- WHEN sender sends any message
- THEN system sends welcome message and returns

#### Scenario: Auth from nav command
- GIVEN unauthorized sender sends "menu" or "1"
- WHEN sender sends any command
- THEN same behavior as unauthorized — welcome message only

### Requirement: Kiosk Mode

When `BOT_AUTHORIZED_CHAT_ID` is not set (null/undefined), the system MUST treat ALL senders as unauthorized.

#### Scenario: No auth configured
- GIVEN `BOT_AUTHORIZED_CHAT_ID` is absent
- WHEN any sender sends a message
- THEN system sends welcome message and returns

#### Scenario: Repeat messages in kiosk
- GIVEN same sender messages multiple times without auth
- WHEN each message arrives
- THEN each gets welcome — no state is persisted per sender

### Requirement: Welcome Message

The system MUST use `BOT_WELCOME_MESSAGE` as the response text for unauthorized senders. The env field SHOULD have a `Zod.default("Bienvenido a Astral bot")`. If set to empty string `""`, the system SHALL send an empty string — no fallback to default occurs.

#### Scenario: Default message
- GIVEN env has no `BOT_WELCOME_MESSAGE`
- WHEN unauthorized message received
- THEN response is "Bienvenido a Astral bot"

#### Scenario: Custom message
- GIVEN env has `BOT_WELCOME_MESSAGE="Custom"`
- WHEN unauthorized message received
- THEN response is "Custom"

#### Scenario: Empty message
- GIVEN env has `BOT_WELCOME_MESSAGE=""`
- WHEN unauthorized message received
- THEN system sends empty string (no crash)

### Requirement: Access Logging

The system MUST log every unauthorized access attempt at `warn` level including the sender chat ID.

#### Scenario: Unauthorized attempt
- GIVEN env var set, wrong sender
- WHEN system processes message
- THEN log includes `sender` at `warn` level

#### Scenario: Kiosk attempt
- GIVEN no auth configured
- WHEN any message arrives
- THEN log includes `sender` at `warn` level

### Requirement: Branding — "Astral Bot"

All user-visible instances of "DCM Bot" MUST be replaced with "Astral Bot".

| Location | Current | Required |
|----------|---------|----------|
| QR page `<title>` | `DCM Bot — Conexión WhatsApp` | `Astral Bot — Conexión WhatsApp` |
| QR page `<h1>` | `📱 DCM Bot` | `📱 Astral Bot` |
| Console startup log | `🚀 Iniciando DCM Chatbot...` | `🚀 Iniciando Astral Bot...` |
| `mainMenu()` header | `👗 *DCM - Asistente de Confección*` | `👗 *Astral Bot - Asistente de Confección*` |
| `helpMenu()` header | `📚 *Ayuda - DCM Asistente*` | `📚 *Ayuda - Astral Bot*` |

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
| `BOT_AUTHORIZED_CHAT_ID` set but empty string | Zod `.optional()` treats `""` as a provided value. `!authorizedChatId` guard normalizes to kiosk mode (safe default). Operator should NOT set the var to empty; remove it entirely for kiosk mode. |
