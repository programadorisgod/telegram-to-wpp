# Archive Report — Auth Gate & Branding

**Archived**: 2026-06-01
**Change**: auth-gate
**Branch**: `feat/auth-gate`

## Summary

Restricted bot access to a single authorized WhatsApp user via `BOT_AUTHORIZED_CHAT_ID`. Unauthorized senders receive only a welcome message — no state, no commands, no data exposure. Renamed branding from "DCM Bot" to "Astral Bot" across all user-visible surfaces.

## Requirements Implemented

| ID | Description | Status |
|----|-------------|--------|
| R1 | Authorization Gate — validate sender against `BOT_AUTHORIZED_CHAT_ID` | ✅ |
| R2 | Kiosk Mode — all senders treated as unauthorized when no chat ID configured | ✅ |
| R3 | Welcome Message — configurable response for unauthorized senders | ✅ |
| R4 | Access Logging — warn-level log with sender chat ID on unauthorized access | ✅ |
| R5 | Branding — "DCM Bot" → "Astral Bot" across QR page, console, menus | ✅ |
| R6 | Client Management — Authorization Dependency (precondition added to spec) | ✅ |
| NF1-NF5 | Non-functional requirements (security, logging, performance, startup, correctness) | ✅ |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `auth/` | Created | New main spec at `openspec/specs/auth/spec.md` with 5 requirements, 10 scenarios, 5 non-functional requirements, and edge cases |
| `client-management/` | Updated | Added authorization precondition note to `openspec/specs/client-management/spec.md` |

## Files Modified

| File | Change |
|------|--------|
| `src/infrastructure/config/env.ts` | Added `BOT_AUTHORIZED_CHAT_ID` (`.optional()`) and `BOT_WELCOME_MESSAGE` (`.default(...)`) |
| `src/interface/whatsapp/MessageHandler.ts` | Added auth gate + 2 constructor params (`authorizedChatId`, `welcomeMessage`) |
| `src/main.ts` | Injected env vars into MessageHandler; renamed branding in QR page and startup log |
| `src/interface/whatsapp/DCMenuService.ts` | Renamed `mainMenu()` and `helpMenu()` headers to "Astral Bot" |
| `.env.example` | Added `BOT_AUTHORIZED_CHAT_ID` and `BOT_WELCOME_MESSAGE` with kiosk-mode comments |

## Verification Results

- **14 spec scenarios**: ✅ All pass
- **4 tasks**: ✅ All complete
- **TypeScript**: ✅ `tsc --noEmit` passes with zero errors
- **Verify Report**: Engram observation #594 (`sdd/auth-gate/verify-report`)

## Key Technical Decisions

1. **Empty-string normalization**: `!this.authorizedChatId` correctly handles `undefined`, `null`, and `""` → kiosk mode. Zod's `.optional()` treats `""` as provided, but the `!val` guard normalizes it safely.
2. **Auth gate before state machine**: Guarantees unauthorized senders never reach `getState()`, menu rendering, or domain controllers.
3. **No auth on `editMessage`**: Bot's own outgoing edits bypass `handle()` — no sender context, no auth needed.
4. **Warn-level logging**: Unauthorized access is notable but not an error; kiosk mode is a valid operational state.

## Engram Artifacts

| Artifact | Observation ID |
|----------|---------------|
| proposal | (not in engram — openspec filesystem) |
| spec | (not in engram — openspec filesystem) |
| design | (not in engram — openspec filesystem) |
| tasks | (not in engram — openspec filesystem) |
| verify-report | #594 |
| archive-report (this) | (current) |

## Source of Truth Updated

- `openspec/specs/auth/spec.md` — New: Authorization & Access Control
- `openspec/specs/client-management/spec.md` — Updated: Authorization precondition

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.

## Next Steps

- **Phase 2: Feature Registry** — Multi-feature architecture that decouples the auth gate from domain-specific features like client management and the upcoming Tasks feature.
