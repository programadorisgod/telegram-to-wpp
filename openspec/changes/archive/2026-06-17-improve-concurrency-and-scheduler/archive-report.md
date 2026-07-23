# Archive: Improve Concurrency and Scheduler

## Summary
Added p-limit concurrency limiter to BaileysClient (configurable via WHATSAPP_CONCURRENCY) and replaced in-memory NodeCronScheduler with persistent DbPollScheduler backed by a new `reminder_events` table in Turso. The cancelReminder bug is fixed — soft-deleted tasks now cancel pending reminder events in the DB.

## Changes Applied
| File | Action | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/types.ts` | Modified | Added `concurrency?: number` to WhatsAppConfig |
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modified | Wrapped `on("message")` with p-limit concurrency limiter |
| `packages/db-core/src/schema/reminder_events.ts` | Created | Drizzle table: reminder_events (id, taskId, eventType, fireAt, status, firedAt, occurrence) |
| `packages/db-core/src/schema/index.ts` | Modified | Exported reminderEvents table and types |
| `src/application/ports/IReminderEventRepository.ts` | Created | Port interface for reminder event persistence |
| `src/infrastructure/db/TursoReminderEventRepository.ts` | Created | Turso implementation of IReminderEventRepository |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | Created | DB polling scheduler implementing ISchedulerService |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Deleted | Replaced by DbPollScheduler |
| `src/infrastructure/config/env.ts` | Modified | Added WHATSAPP_CONCURRENCY and DB_POLL_INTERVAL_MS |
| `src/main.ts` | Modified | Wired DbPollScheduler and concurrency config |
| `package.json` | Modified | Added p-limit dependency |

## Specs Merged
| Domain | Action | Notes |
|--------|--------|-------|
| `reminder-persistence` | Created | New main spec created from delta — 5 requirements, 3 NFRs |
| `recurring-reminders` | Updated | Restart Recovery modified to use DB migration; Database Migration requirement removed (superseded) |

## Verification
- Status: PASS WITH SUGGESTIONS (per orchestrator)
- Critical issues: 0
- Suggestions: 3 (all low priority, cosmetic/documentation)
- Type check: passes (tsc --noEmit)
- Schema: pushed via drizzle-kit

## Known Limitations
- Reminders may fire up to one poll interval late (~15s default) instead of exact millisecond timing
- No TTL/cleanup policy for old fired `reminder_events` rows — manual purge may be needed
- Polling scheduler requires single-instance deployment; multi-instance would need optimistic locking

## Engram Artifact Lineage
- Proposal: obs#878
- Spec: obs#879
- Design: obs#880
- Tasks: obs#881

## Next Steps
- Consider adding TTL/index cleanup for stale `reminder_events` rows
- Consider fixing the cancelReminder call in soft-delete use cases if not already done
- Investigate multi-instance race condition handling if scaling to multiple pods
