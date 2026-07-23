# Design: Improve Concurrency and Scheduler

## Technical Approach

**Concurrency limiter**: Wrap `BaileysClient`'s `on("message")` handler with `p-limit` (configurable via `WHATSAPP_CONCURRENCY`, default 3). Messages beyond the limit queue internally, providing backpressure against Puppeteer saturation.

**DB polling scheduler**: Replace `NodeCronScheduler` (in-memory `setTimeout`) with `DbPollScheduler` (DB polling on `reminder_events` table). Same `ISchedulerService` interface — zero changes to use cases. Boot migration via existing `reRegisterPendingReminders()` now INSERTs DB rows instead of scheduling timers.

## Architecture Decisions

### Decision: DB polling over cron or external queue

| Option | Tradeoff | Decision |
|--------|----------|----------|
| DB polling (15s interval) | Up to 15s latency on reminder fire | ✅ Chosen — Turso already in stack, no new infra |
| Redis sorted sets | Adds external dependency | ❌ Rejected — proposal out of scope |
| NodeCronScheduler (setTimeout) | Lost on crash, no recovery | ❌ Rejected — root cause of reliability issue |

**Rationale**: Single-instance deployment. DB polling is the minimal viable persistence layer given existing Turso usage.

### Decision: reminder_events as the persistence boundary

**Choice**: Every reminder offset (one_day_before, three_hours_before, one_hour_before, exact_time) becomes one `reminder_events` row.

**Alternatives considered**: Store only task-level state and compute offsets on poll.

**Rationale**: Simplifies query — just `fire_at <= now AND status = 'pending'`. Matches the offset-computation logic already in `NodeCronScheduler`.

### Decision: Hard cut-over (no dual-run)

**Choice**: Deploy `DbPollScheduler`, delete `NodeCronScheduler` in same commit.

**Alternatives considered**: Phase both schedulers simultaneously.

**Rationale**: `reRegisterPendingReminders()` re-creates all entries on boot. Dual-run would require keeping both implementations in sync — unnecessary complexity for single-instance deployment.

## Data Flow

```
Boot
  └─ ReminderScheduler.reRegisterPendingReminders()
       └─ taskRepo.findPendingReminders()     ← tasks table
            └─ scheduler.schedule*(...)      ← DbPollScheduler
                 └─ TursoReminderEventRepository.insert()  ← reminder_events table

Runtime (DbPollScheduler loop, every 15s)
  └─ TursoReminderEventRepository.findDue()
       └─ fire callbacks (WhatsApp message)
       └─ mark status = 'fired' (or 'cancelled' if cancelReminder)
       └─ for recurring: insert next occurrence row
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/types.ts` | Modify | Add `concurrency?: number` to `WhatsAppConfig` |
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modify | Wrap `on("message")` with `p-limit` |
| `packages/db-core/src/schema/reminder_events.ts` | Create | Drizzle table: id, taskId, type, fireAt, status, createdAt, firedAt |
| `packages/db-core/src/schema/index.ts` | Modify | Export `reminder_events` and its types |
| `src/application/ports/IReminderEventRepository.ts` | Create | Port interface for reminder event persistence |
| `src/infrastructure/db/TursoReminderEventRepository.ts` | Create | Turso implementation of IReminderEventRepository |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | Create | ISchedulerService backed by DB polling |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Delete | Replaced by DbPollScheduler |
| `src/infrastructure/config/env.ts` | Modify | Add `WHATSAPP_CONCURRENCY` (default 3), `DB_POLL_INTERVAL_MS` (default 15000) |
| `src/main.ts` | Modify | Wire `DbPollScheduler` instead of `NodeCronScheduler`; pass `concurrency` config to BaileysClient |

## Interfaces / Contracts

```typescript
// packages/db-core/src/schema/reminder_events.ts
export const reminderEvents = sqliteTable("reminder_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  type: text("type").notNull(), // one_day_before | three_hours_before | one_hour_before | exact_time
  fireAt: text("fire_at").notNull(), // ISO 8601
  status: text("status").notNull(),  // pending | fired | cancelled
  createdAt: text("created_at").notNull(),
  firedAt: text("fired_at"),
});

// src/application/ports/IReminderEventRepository.ts
export interface IReminderEventRepository {
  insert(event: NewReminderEvent): Promise<ReminderEvent>;
  findByTaskId(taskId: string): Promise<ReminderEvent[]>;
  findDue(now: Date): Promise<ReminderEvent[]>;
  markFired(id: string): Promise<void>;
  markCancelled(taskId: string): Promise<void>;
}
```

`DbPollScheduler` implements `ISchedulerService` (same interface as `NodeCronScheduler`). `cancelReminder()` now calls `reminderEventRepo.markCancelled(taskId)` before clearing jobs — fixing the bug where soft-delete never cancelled pending events.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `DbPollScheduler` polling logic, offset computation | Mock `IReminderEventRepository`; verify `findDue` query and `markFired` calls |
| Unit | `BaileysClient` p-limit wrapper | Mock `Client`, verify concurrent handlers respect limit |
| Integration | Full boot → reminder fire flow | Manual test: create task, kill process, restart, verify reminder fires |
| Integration | cancelReminder after soft-delete | Create task, soft-delete it, verify `reminder_events` rows are `cancelled` |

## Migration / Rollout

1. Add `p-limit` to `package.json` (`pnpm add p-limit`)
2. Deploy migration creating `reminder_events` table (`drizzle-kit push`)
3. Deploy new code — on boot, `reRegisterPendingReminders()` inserts rows for all pending tasks
4. No data migration needed — existing `tasks` table is unchanged
5. Rollback: revert to `NodeCronScheduler` in `main.ts`; `reminder_events` rows remain (additive)

## Open Questions

- [ ] Confirm `DB_POLL_INTERVAL_MS` default of 15000ms is acceptable (proposal says 15s, could be 10s or 30s)
- [ ] Should `reminder_events` have a TTL/index cleanup policy for old fired rows, or manual purge?
