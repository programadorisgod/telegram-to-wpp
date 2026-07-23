# Archive Report: send-reminder-to-contact

## Summary
Feature enabling Recordar Todo (Astral) users to send task reminders to WhatsApp contacts instead of only to themselves. Full flow: task config → "¿Para vos o para otro?" → contact search by name/number → numbered selection → task persisted with `scheduledFor` → scheduler routes to contact.

## Verification Result
**PASS WITH NOTES** — 1 minor fix applied (nameless contact display format). No blocking issues.

## Specs Synced
| Domain | Action | Details |
|--------|--------|---------|
| contact-search | Copied (new capability) | Full spec synced to `openspec/specs/contact-search/spec.md` |
| task-crud | Merged delta | 1 requirement modified (Task Creation: added scheduledFor), 1 requirement added (Reminder Routing by Recipient) |

## Archive Contents
| Artifact | Path | Status |
|----------|------|--------|
| Design | `design.md` | ✅ 4 architecture decisions, data flow diagram, cache strategy |
| Delta Specs | `specs/task-crud/spec.md` | ✅ 1 ADDED, 1 MODIFIED requirement |
| Tasks | `tasks.md` | ✅ 10 tasks across 5 phases (all complete) |
| Verify Report | `verify-report.md` | ✅ PASS WITH NOTES (1 partial REQ-4 display gap) |

## Files Changed
| File | Action | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/ports/IWhatsAppService.ts` | Modified | +`searchContacts()` in interface |
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modified | +`getContacts()`, +`searchContacts()`, +cache |
| `packages/whatsapp-core/src/services/WhatsAppService.ts` | Modified | +`setContactSearchHandler()`, +`searchContacts()` |
| `packages/whatsapp-core/src/index.ts` | Modified | Barrel export includes `IContactSearchResult` |
| `src/main.ts` | Modified | Contact search handler wired; `task.scheduledFor ?? task.userId` in 3 callbacks |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Modified | 5 new message methods |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | 3 new state handlers, 3 new switch cases |
| `src/domain/entities/astral/Task.ts` | Modified | `scheduledFor: z.string().nullable().optional()` |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | Modified | `recipientId?: string` in DTO |
| `packages/db-core/src/schema/tasks.ts` | Modified | `scheduledFor: text("scheduled_for")` nullable |
| `packages/db-core/drizzle/0001_fresh_crusher_hogan.sql` | Added | Migration: `ALTER TABLE tasks ADD scheduled_for text;` |

## Source of Truth Updated
- `openspec/specs/task-crud/spec.md` — Merged delta (Task Creation modified + Reminder Routing by Recipient added)
- `openspec/specs/contact-search/spec.md` — Already in place (new capability)

## SDD Cycle Complete
**Change**: send-reminder-to-contact
**Archived**: 2026-06-06
**Status**: Complete
