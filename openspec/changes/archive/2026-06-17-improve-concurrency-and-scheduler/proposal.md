# Proposal: Improve Concurrency and Scheduler

## Intent

Two infrastructure gaps are causing reliability issues: (1) BaileysClient has no concurrency control, so simultaneous messages saturate Puppeteer with unbounded parallel handlers, and (2) the scheduler uses in-memory `setTimeout` — reminders are lost on crash, `cancelReminder()` is never called (bug), and boot re-registration has a timing gap. Both are infrastructure improvements that increase system resilience without changing user-facing behavior.

## Scope

### In Scope
- Add p-limit concurrency limiter to BaileysClient message handler (configurable, default 3)
- Create `reminder_events` table in Turso for persistent reminder scheduling
- Implement DbPollScheduler replacing NodeCronScheduler (same ISchedulerService interface)
- Fix cancelReminder bug — soft-delete flow now cancels pending reminder events
- Boot migration: re-register pending tasks as DB events on startup

### Out of Scope
- Reminder callback media download concurrency (separate concern)
- Multi-instance race condition handling (single-instance deployment currently)
- Changes to NLP parsing, task creation, or user-facing flows
- Redis or external queue infrastructure

## Capabilities

### New Capabilities
- `reminder-persistence`: Persistent reminder event storage and DB polling scheduler. Covers the `reminder_events` table, polling loop, and event lifecycle (pending → fired → chained for recurring).

### Modified Capabilities
- `recurring-reminders`: Scheduling backend changes from in-memory setTimeout to DB-persisted events. Requirements unchanged — same recurrence math, same frequency types, same occurrence behavior. Only the storage and recovery mechanism changes.
- `client-management`: No spec-level changes. BaileysClient concurrency limiter is an internal performance guard, not a behavioral change.

## Approach

**Concurrency limiter** (~6 lines): Wrap the `on("message")` callback in BaileysClient with `p-limit`. Add `WHATSAPP_CONCURRENCY` env var (default 3). Messages beyond the limit queue internally. Trivial, zero-risk change.

**DB polling scheduler**: New `reminder_events` table stores every pending reminder as a row. DbPollScheduler polls every 15s for due events, fires callbacks, marks rows as fired. For recurring tasks, inserts the next occurrence after firing. Same `ISchedulerService` interface — zero changes to use cases. Boot migration inserts rows from existing pending tasks.

**Hard cut-over**: Deploy DbPollScheduler, delete NodeCronScheduler. On boot, `reRegisterPendingReminders()` calls the same scheduler methods — now they INSERT instead of setTimeout. No dual-run complexity.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modified | Add p-limit wrapper around message handler |
| `packages/whatsapp-core/src/types.ts` | Modified | Add `concurrency` to WhatsAppConfig |
| `packages/db-core/src/schema/reminder_events.ts` | New | Drizzle table definition |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | New | DB polling scheduler implementation |
| `src/infrastructure/db/TursoReminderEventRepository.ts` | New | Repository for reminder_events |
| `src/application/ports/IReminderEventRepository.ts` | New | Repository port interface |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Removed | Replaced by DbPollScheduler |
| `src/main.ts` | Modified | Wire DbPollScheduler, pass concurrency config |
| `src/infrastructure/config/env.ts` | Modified | Add two env vars |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reminders fire up to 15s late (polling granularity) | Low | Acceptable for human reminders; configurable interval |
| Duplicate events during migration | Medium | cancelReminder clears pending events before re-scheduling |
| Recurrence chain breaks if callback crashes mid-fire | Low | Same behavior as current setTimeout; wrap in try/finally |
| p-limit queue grows under heavy load | Low | WhatsApp rate-limits naturally; dedup window prevents re-processing |

## Rollback Plan

1. Revert main.ts to wire NodeCronScheduler instead of DbPollScheduler.
2. `reminder_events` table remains (additive, no data loss).
3. On reverted boot, `reRegisterPendingReminders()` re-creates setTimeout entries from the unchanged `tasks` table.
4. Remove p-limit wrapper from BaileysClient (single line revert).
5. Full rollback = revert the commit. No data migration needed.

## Dependencies

- Add `p-limit` (^6.x) to root package.json
- Turso/libsql already available (existing dependency)

## Success Criteria

- [ ] BaileysClient processes at most N messages concurrently (configurable via env var)
- [ ] Reminder events persist across process restart — no lost reminders after crash
- [ ] cancelReminder() successfully cancels pending reminders for soft-deleted tasks
- [ ] Boot re-registration completes without timing gap (events already in DB)
- [ ] All existing recurring reminder behaviors unchanged (frequency types, occurrence math, end conditions)
- [ ] NodeCronScheduler file removed, zero references remain
