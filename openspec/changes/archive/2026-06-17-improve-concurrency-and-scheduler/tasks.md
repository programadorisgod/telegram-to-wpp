# Tasks: Improve Concurrency and Scheduler

## Phase 1: Infrastructure

- [ ] 1.1 Install `p-limit` (^6.x) in root `package.json`
- [ ] 1.2 Create `packages/db-core/src/schema/reminder_events.ts` — Drizzle table with id, taskId, type, fireAt, status, createdAt, firedAt
- [ ] 1.3 Export `reminderEvents` and types from `packages/db-core/src/schema/index.ts`
- [ ] 1.4 Add `WHATSAPP_CONCURRENCY` (default 3) and `DB_POLL_INTERVAL_MS` (default 15000) to `src/infrastructure/config/env.ts`

## Phase 2: Repository Interface & Implementation

- [ ] 2.1 Create `src/application/ports/IReminderEventRepository.ts` — port: insert, findByTaskId, findDue, markFired, markCancelled
- [ ] 2.2 Create `src/infrastructure/db/TursoReminderEventRepository.ts` — Turso impl of IReminderEventRepository

## Phase 3: Core Implementation

- [ ] 3.1 Add `concurrency?: number` to `WhatsAppConfig` in `packages/whatsapp-core/src/types.ts`
- [ ] 3.2 Wrap `BaileysClient.on("message")` with `p-limit` in `packages/whatsapp-core/src/client/BaileysClient.ts`
- [ ] 3.3 Create `src/infrastructure/scheduler/DbPollScheduler.ts` — ISchedulerService backed by DB polling with findDue/markFired loop, recurring chaining, and cancelReminder calling markCancelled
- [ ] 3.4 Update boot migration in `ReminderScheduler.reRegisterPendingReminders()` to insert `reminder_events` rows from tasks table (skip past occurrences)

## Phase 4: Wiring & Cleanup

- [ ] 4.1 Wire `DbPollScheduler` and pass `concurrency` config in `src/main.ts`
- [ ] 4.2 Delete `src/infrastructure/scheduler/NodeCronScheduler.ts` and all references

## Phase 5: Testing

- [ ] 5.1 Unit test: BaileysClient p-limit wrapper respects max concurrency (mock Client, verify handler queue)
- [ ] 5.2 Unit test: DbPollScheduler event lifecycle — findDue returns pending events, markFired updates status, recurring inserts next occurrence
- [ ] 5.3 Unit test: cancelReminder calls markCancelled and prevents future polling
