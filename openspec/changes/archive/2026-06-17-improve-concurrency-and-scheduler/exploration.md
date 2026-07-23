# Exploration: improve-concurrency-and-scheduler

## 1. Current State

### 1.1 Concurrency — BaileysClient Message Handling

**File:** `packages/whatsapp-core/src/client/BaileysClient.ts`

The `on("message")` listener (lines 174–316) is a **single sequential async callback**. Every incoming message — whether text, media, or media+caption — blocks the next message until it completes processing. The flow:

```
whatsapp-web.js (Puppeteer/CDP) 
  → BaileysClient.on("message")      ← SINGLE async callback
    → downloadMedia()                 ← CPDP call (Puppeteer bottleneck)
      → incomingMediaHandler()        ← blocks until done
    OR
    → messageHandler.handle()         ← blocks until done
      → MessageHandler.handle()       ← page:src/interface/whatsapp/MessageHandler.ts
        → Feature.handleSubmenuCommand()
          → AstralController → NLP parse → AI call (network) → DB write → scheduler
```

**Identified bottlenecks:**

1. **No concurrency limiting.** If 5 messages arrive simultaneously, they are queued and processed one at a time. A single slow AI call (up to 30s) blocks everything behind it.
2. **Media download** (line 210, 275) is a Puppeteer CDP call that takes ~1-3 seconds. During this time, the single callback is blocked.
3. The `incomingMediaHandler` (line 316–344 in main.ts) routes to `astralFeature.handleMedia()` which may do OCR (Tesseract.js), Groq transcription API calls, or Supabase uploads — all potentially slow operations.
4. **No existing concurrency controls.** The class has `SimpleTTLCache` instances for dedup, but no throttle, queue, or limiter.

**Constructor parameters** (line 44–52):
```typescript
constructor(private config: WhatsAppConfig) {
    // WhatsAppConfig: { sessionPath, chromePath, cacheTtlMs?, cacheMaxSize?, contactsCacheTtlMs? }
}
```
The `WhatsAppConfig` type lives in `packages/whatsapp-core/src/types.ts`. No concurrency-related config exists.

**p-limit integration point:** The `on("message")` callback (line 174) would be wrapped with p-limit so that a configurable number (e.g., 3) of handlers can run concurrently, and additional messages wait until a slot frees.

### 1.2 Scheduler — NodeCronScheduler

**Files:**
- `src/application/ports/ISchedulerService.ts` — Interface (5 methods)
- `src/infrastructure/scheduler/NodeCronScheduler.ts` — Implementation (194 lines)
- `src/infrastructure/scheduler/recurrence-utils.ts` — Recurrence math (136 lines)
- `src/application/use-cases/astral/ReminderScheduler.ts` — Boot re-registration orchestrator (154 lines)

**CRITICAL DISCOVERY:** The class name "NodeCronScheduler" is a **misnomer**. It does NOT use `node-cron`. It uses raw `setTimeout` calls stored in an in-memory `Map<string, TimeoutJobEntry[]>` (line 20). The `node-cron` npm package is NOT a dependency (verified in `package.json`).

**How it works today:**

1. **scheduleTaskReminder** (lines 27–83): Creates up to 4 `setTimeout` entries for a task (oneDayBefore, threeHoursBefore, oneHourBefore, exactTime). Each timeout fires `this.fireReminder()` which calls registered callbacks.
2. **scheduleRecurringTask** (lines 85–165): Similar, but uses `scheduleOccurrence` (inner function, line 119) which after firing the EXACT_TIME or ONE_HOUR_BEFORE reminder, calculates the next occurrence via `calculateNextOccurrence()` and recursively schedules it via another `setTimeout`.
3. **cancelReminder** (lines 174–183): Clears all timeouts for a taskId and deletes from the Map.
4. **onReminder** (lines 23–25): Registers a callback (push to array).
5. **scheduleProjectReminder** (lines 167–173): No-op stub ("not yet implemented").

**Recurrence chaining** (lines 137–151 of NodeCronScheduler.ts): When an `exact_time` or `one_hour_before` (when `exactTime` is disabled) reminder fires:
```typescript
if (type === "exact_time" || (type === "one_hour_before" && !config.exactTime)) {
    const nextOccCount = occCount + 1;
    if (frequency.endAfterOccurrences != null && nextOccCount > frequency.endAfterOccurrences) return;
    const nextDt = calculateNextOccurrence(dt, frequency);
    if (isWithinEndCondition(nextDt, frequency)) {
        scheduleOccurrence(nextDt, nextOccCount); // recursive setTimeout
    }
}
```
The occurrence counter is **local to the callback closure** — not stored in DB.

**Boot re-registration** (`ReminderScheduler.reRegisterPendingReminders()`, lines 116–153):
- Queries `taskRepo.findPendingReminders()` which returns tasks where `datetime >= NOW() OR frequency IS NOT NULL`.
- Processes in parallel chunks (chunkSize from `env.REMINDER_REGISTRATION_CHUNK_SIZE`, default 10).
- For each task: parses `reminderConfig` and `frequency` from JSON text columns, then calls `scheduleOne()` which delegates to `scheduler.scheduleTaskReminder()` or `scheduler.scheduleRecurringTask()`.

### 1.3 Identified Gap: cancelReminder is Never Called Externally

`ISchedulerService.cancelReminder()` (line 37 of the port) is defined but **never called from any use case or controller**. When a task is soft-deleted via `TursoTaskRepository.softDelete()`, the corresponding `setTimeout` entries continue to run. The reminders will still fire even after the task is deleted. This is an existing bug.

### 1.4 Reminder Callback (main.ts lines 178–258)

When a reminder fires:
1. Looks up the task via `taskRepo.findById(event.taskId)`.
2. If no task found (deleted), silently returns — this is the only safety net for the cancelReminder bug.
3. If task has `mediaUrl` + `mediaType`: downloads from Supabase via fetch(), converts to base64, sends via `whatsappService.sendMedia()`, then deletes the media from Supabase.
4. If no media: sends text-only reminder via `whatsappService.sendMessage()`.
5. The `whatsappService` delegates to `baileysClient.sendMessage()`/`sendMedia()` which call `client.sendMessage()` (Puppeteer/CDP).

### 1.5 CreateTaskFromNLP (src/application/use-cases/astral/CreateTaskFromNLP.ts)

- Persists task to DB (line 46).
- Schedules reminders via scheduler (lines 49–62) — recurring or one-time.
- **Does not store scheduler state** — the scheduler manages its own in-memory state.

### 1.6 DB Schema (packages/db-core/src/schema/tasks.ts)

The `tasks` table:
- `id`, `user_id`, `description`, `datetime`, `reminder_config` (JSON text), `media_url`, `media_type`, `scheduled_for`, `frequency` (JSON text | NULL), `created_at`, `deleted_at`
- **No column for "reminder status" or "last fired"** — the scheduler state is entirely in-memory.

### 1.7 Infrastructure Patterns

- **Repository pattern:** `src/infrastructure/db/Turso*Repository.ts` implements `src/application/ports/I*Repository.ts`
- **Constructor injection:** All dependencies passed via constructor (no DI framework)
- **Schema pattern:** Drizzle ORM `sqliteTable()` in `packages/db-core/src/schema/*.ts`
- **Schema index:** `packages/db-core/src/schema/index.ts` aggregates all tables and types
- **Config:** `src/infrastructure/config/env.ts` uses Zod validation
- **Scheduler pattern:** `src/infrastructure/scheduler/` contains implementation + utils

---

## 2. Affected Areas

### Concurrency change:

| File | Why affected |
|------|-------------|
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Add p-limit wrapper around `on("message")` handler |
| `packages/whatsapp-core/src/types.ts` | Add `concurrency` config field to `WhatsAppConfig` |
| `src/main.ts` line 66–72 | Pass `concurrency` to BaileysClient constructor |
| `src/infrastructure/config/env.ts` | Add `WHATSAPP_CONCURRENCY` env var |
| `package.json` (root) | Add `p-limit` dependency |

### Scheduler change:

| File | Why affected |
|------|-------------|
| `packages/db-core/src/schema/reminder_events.ts` | **NEW** — Drizzle schema for `reminder_events` table |
| `packages/db-core/src/schema/index.ts` | Register new table + types |
| `packages/db-core/src/index.ts` | Export new table + types |
| `src/application/ports/ISchedulerService.ts` | Interface stays the same (DbPollScheduler implements same interface) |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | **NEW** — DB polling scheduler implementation |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | **DELETE** after migration complete (can coexist during transition) |
| `src/infrastructure/scheduler/recurrence-utils.ts` | Reuse (unchanged — moved to scheduler directory) |
| `src/infrastructure/db/TursoReminderEventRepository.ts` | **NEW** — Repository for `reminder_events` table |
| `src/application/ports/IReminderEventRepository.ts` | **NEW** — Port interface |
| `src/application/use-cases/astral/ReminderScheduler.ts` | Change boot re-registration to insert DB events instead of setTimeout |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | No change needed (calls same `ISchedulerService` interface) |
| `src/main.ts` lines 102, 122, 565 | Wire DbPollScheduler instead of NodeCronScheduler; call `scheduler.start()` in boot |
| `src/infrastructure/config/env.ts` | Add `REMINDER_POLL_INTERVAL_MS` env var |
| `package.json` (root) | Remove `node-cron` dependency? (Not present — `node-cron` was never a dependency) |

---

## 3. Proposed Solution Architecture

### 3.1 Concurrency Limiter: p-limit in BaileysClient

Add `p-limit` to the `on("message")` callback:

```typescript
// BaileysClient.ts
import pLimit from "p-limit";

constructor(private config: WhatsAppConfig) {
    this.limiter = pLimit(config.concurrency ?? 3);
    // ...
}

// Inside initialize():
this.client.on("message", async (message: Message) => {
    await this.limiter(async () => {
        // ... existing handler body (dedup, media download, handler call)
    });
});
```

This ensures at most N handlers run concurrently. Additional messages are queued by p-limit's internal queue.

**Config:**
- New env var: `WHATSAPP_CONCURRENCY` (default: 3, range: 1–10)
- Added to `WhatsAppConfig` interface

### 3.2 DB Polling Scheduler: DbPollScheduler

**Architecture:**

```
┌─────────────────┐     poll (every N seconds)      ┌──────────────────┐
│  DbPollScheduler │ ──────────────────────────────> │  reminder_events  │
│  (ISchedulerService)│ <────────────────────────── │  (Turso DB)       │
└────────┬────────┘    return due events             └──────────────────┘
         │ fireReminder()
         ▼
    ReminderScheduler.onReminder() callback
         │
         ▼
    WhatsApp send (via BaileysClient)
```

**Design decisions:**

1. **DB polling instead of cron/file-based:** The system already uses Turso (libsql), which is fast for indexed queries. A polling interval of 15–30 seconds is acceptable for reminder precision (±30s max drift for "exact_time" reminders).

2. **reminder_events table stores every scheduled reminder occurrence:**
   - One-time task → 1–4 rows (oneDayBefore, threeHoursBefore, oneHourBefore, exactTime)
   - Recurring task → 1–2 rows for the NEXT occurrence (oneHourBefore, exactTime) + chain logic inserts the next occurrence after the current fires.

3. **The scheduler is an event source:** When a `ReminderEvent` fires, the callback (same as today) executes. After firing, the row is marked as `fired = 1`. For recurring tasks, the next occurrence is calculated and a new row is inserted.

4. **Boot re-registration becomes a no-op:** Instead of re-reading tasks and creating setTimeout entries on boot, the `start()` method begins polling. All pending events are already in the DB, ready to be picked up.

**Comparison of approaches:**

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **DB Polling (proposed)** | Survives restarts; queryable state; simpler boot; can be inspected/debugged; no memory leaks from timeout accumulation | 15–30s granularity for reminders; extra DB writes | Medium |
| **Keep setTimeout + persist to DB** | Exact millisecond timing; minimal DB load | Complex dual-state sync; still loses timers on crash without recovery | High |
| **Use node-cron with DB persistence** | Library handles scheduling; established pattern | node-cron is complex for one-shot reminders; same persistence problem | Medium-High |
| **Redis-based (Bull/BullMQ)** | Queue semantics; retries; delayed jobs | New infra dependency (Redis); overkill for reminder use case | High |

### 3.3 Data Model: reminder_events Table

```sql
CREATE TABLE reminder_events (
    id          TEXT PRIMARY KEY,          -- UUID v4
    task_id     TEXT NOT NULL,             -- FK → tasks.id (no formal FK for flexibility)
    user_id     TEXT NOT NULL,             -- FK → users.user_id (for index + query optimization)
    event_type  TEXT NOT NULL,             -- 'one_day_before' | 'three_hours_before' | 'one_hour_before' | 'exact_time'
    fire_at     TEXT NOT NULL,             -- ISO 8601 datetime
    occurrence  INTEGER NOT NULL DEFAULT 1, -- which occurrence (for recurring tasks)
    fired       INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = fired
    created_at  TEXT NOT NULL,             -- ISO 8601
    fired_at    TEXT,                      -- ISO 8601 (NULL = not yet fired)

    -- Drizzle DDL equivalent (sqliteTable):
    -- id: text("id").primaryKey(),
    -- taskId: text("task_id").notNull(),
    -- userId: text("user_id").notNull(),
    -- eventType: text("event_type").notNull(),
    -- fireAt: text("fire_at").notNull(),
    -- occurrence: integer("occurrence").notNull().default(1),
    -- fired: integer("fired").notNull().default(0),
    -- createdAt: text("created_at").notNull(),
    -- firedAt: text("fired_at"),
);
CREATE INDEX idx_reminder_events_pending ON reminder_events(fired, fire_at);
CREATE INDEX idx_reminder_events_task ON reminder_events(task_id);
```

**Polling query** (pseudo-SQL):
```sql
SELECT * FROM reminder_events
WHERE fired = 0 AND fire_at <= datetime('now')
ORDER BY fire_at ASC
LIMIT 50;
```

**For recurring tasks:** After firing, the callback calculates `nextFireAt` using `calculateNextOccurrence()`, checks `isWithinEndCondition()`, and inserts a new row with `occurrence + 1`.

### 3.4 DbPollScheduler Class Design

```typescript
export class DbPollScheduler implements ISchedulerService {
    private pollTimer: NodeJS.Timeout | null = null;
    private callbacks: Array<(reminder: ReminderEvent) => void> = [];
    private isRunning = false;

    constructor(
        private readonly repo: IReminderEventRepository,
        private readonly pollIntervalMs: number = 30_000,
    ) {}

    start(): void { /* begin polling loop */ }
    stop(): void { /* clear interval */ }

    // ISchedulerService implementation:
    async scheduleTaskReminder(taskId, datetime, config): Promise<void> { /* INSERT rows */ }
    async scheduleRecurringTask(taskId, datetime, config, frequency): Promise<void> { /* INSERT rows */ }
    async cancelReminder(taskId): Promise<void> { /* UPDATE fired=1 WHERE fired=0 */ }
    onReminder(cb): void { /* register */ }
}
```

**Key difference from NodeCronScheduler:** `scheduleTaskReminder` and `scheduleRecurringTask` now INSERT rows into `reminder_events` instead of creating `setTimeout` entries.

---

## 4. File Change Inventory

### NEW files:
1. `packages/db-core/src/schema/reminder_events.ts` — Drizzle table definition
2. `src/application/ports/IReminderEventRepository.ts` — Repository port interface
3. `src/infrastructure/db/TursoReminderEventRepository.ts` — Turso implementation
4. `src/infrastructure/scheduler/DbPollScheduler.ts` — DB polling scheduler

### MODIFIED files:
1. `packages/db-core/src/schema/index.ts` — Register `reminderEvents` table + exports
2. `packages/db-core/src/index.ts` — Export new table + types
3. `packages/whatsapp-core/src/types.ts` — Add `concurrency` to `WhatsAppConfig`
4. `packages/whatsapp-core/src/client/BaileysClient.ts` — Add p-limit concurrency limiter
5. `src/infrastructure/config/env.ts` — Add `WHATSAPP_CONCURRENCY` + `REMINDER_POLL_INTERVAL_MS`
6. `src/main.ts` — Wire DbPollScheduler (replace NodeCronScheduler); pass concurrency config; call `scheduler.start()`
7. `src/application/use-cases/astral/ReminderScheduler.ts` — Adapt boot re-registration to DB mode

### DELETED files (after migration validated):
1. `src/infrastructure/scheduler/NodeCronScheduler.ts` — Remove setTimeout-based scheduler

### UNCHANGED files (interface compatibility):
- `src/application/ports/ISchedulerService.ts` — Interface unchanged (both impls implement it)
- `src/application/use-cases/astral/CreateTaskFromNLP.ts` — Calls same interface
- `src/interface/whatsapp/features/astral/AstralFeature.ts` — Calls same interface
- `src/infrastructure/scheduler/recurrence-utils.ts` — Reused by DbPollScheduler
- `src/domain/entities/astral/Task.ts` — No schema change needed

### Dependencies:
- Add `p-limit` (^6.x) to root `package.json`
- No removal needed (node-cron was never a dependency)

---

## 5. Migration Strategy

### 5.1 Phase 0: Add p-limit (Independent, parallel)

1. Add `p-limit` dependency.
2. Add `concurrency` to `WhatsAppConfig` type.
3. Add `WHATSAPP_CONCURRENCY` to env.ts.
4. Wrap `on("message")` handler in `BaileysClient` with p-limit.
5. Pass `concurrency` in main.ts constructor.
6. This phase is **independent** of the scheduler change and can be deployed separately.

### 5.2 Phase 1: Create DB infrastructure

1. Create `reminder_events` table schema + migration (drizzle-kit generate/push).
2. Create `IReminderEventRepository` port + `TursoReminderEventRepository`.
3. Create `DbPollScheduler` implementing `ISchedulerService`.

### 5.3 Phase 2: Dual-run transition window

During transition, run BOTH schedulers:
1. Keep `NodeCronScheduler` wired for existing in-memory timers.
2. Start `DbPollScheduler` in parallel, with the same `onReminder` callback.
3. **NEW tasks** → written to both schedulers (or just DbPollScheduler for a clean cut).
4. **Existing tasks** → migrated programmatically: for each task in `findPendingReminders()`, insert corresponding rows into `reminder_events`. The NodeCronScheduler continues running its existing setTimeout entries.
5. After one full recurrence cycle (or 24h), remove NodeCronScheduler.

**Simpler approach (recommended):** Do a hard cut-over on restart:
1. Deploy the new code with `DbPollScheduler`.
2. On boot, the `ReminderScheduler.reRegisterPendingReminders()` method changes from calling `scheduleOne()` on the old scheduler to calling a **migration method**: for each pending task, parse its config/frequency and INSERT rows into `reminder_events`.
3. Delete `NodeCronScheduler` file (it's unused).
4. If rollback is needed, revert to previous commit — tasks table is unchanged, reminder_events table is additive.

### 5.4 Migration Query (boot migration)

The `reRegisterPendingReminders()` method in `ReminderScheduler` changes to:

```typescript
async reRegisterPendingReminders(): Promise<void> {
    const pending = await this.taskRepo.findPendingReminders();
    for (const task of pending) {
        const config = parseReminderConfig(task.reminderConfig);
        if (!config) continue;
        const frequency = parseFrequency(task.frequency);
        if (frequency) {
            await this.scheduler.scheduleRecurringTask(task.id, new Date(task.datetime), config, frequency);
        } else {
            await this.scheduler.scheduleTaskReminder(task.id, new Date(task.datetime), config);
        }
    }
}
```

Since `this.scheduler` is now `DbPollScheduler`, these calls INSERT rows instead of creating setTimeout entries. The interface is identical — no code change needed in `ReminderScheduler` itself (only the wiring in main.ts changes).

### 5.5 Rolling back

1. Revert main.ts to wire `NodeCronScheduler`.
2. `reminder_events` table can remain (it won't be queried by the old scheduler).
3. On the reverted boot, `reRegisterPendingReminders()` re-creates setTimeout entries from the `tasks` table — which is unchanged.

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Polling latency** — reminders fire up to `pollIntervalMs` late | Low | Set `REMINDER_POLL_INTERVAL_MS` to 15s default; for human reminders, 15s delay is negligible |
| **Polling load on Turso** — N queries every interval | Low | Query is indexed (`fired, fire_at`); even 500 pending reminders → single SELECT; Turso handles this trivially |
| **Race condition** — Two pods polling simultaneously | Low | Currently single-instance deployment; if multi-instance, add `LIMIT 1` + `UPDATE SET fired=1 WHERE id=? AND fired=0` with optimistic locking |
| **Duplicate events** — Same task re-scheduled during migration | Medium | Use `onConflictDoNothing` or check before INSERT in repository; `scheduleTaskReminder` always calls `cancelReminder` first (clears pending events) |
| **Missed events during crash** — Events between poll intervals | Low | Same as current setTimeout approach (timers lost on crash); DB polling recovers on next start (events are persisted, not ephemeral) |
| **Recurrence chain failure** — If the callback crashes after firing but before inserting the next occurrence | Medium | Wrap in try/finally; if next occurrence insertion fails, the task stops recurring (same behavior as current setTimeout approach where the chain breaks) |
| **cancelReminder external usage gap** | Low | The new `cancelReminder` in DbPollScheduler actually updates DB rows; soft-delete use cases now must call it. Currently they don't, but the reminder callback check `if (!task) return` prevents visible impact. **This is a pre-existing bug that can be fixed separately.** |
| **p-limit queue overflow** — Too many messages queued | Low | WhatsApp rate limits already throttle; p-limit with concurrency=3 provides backpressure; 500ms dedup window prevents re-processing |

---

## 7. Open Questions

1. **Polling interval default:** 15 seconds or 30 seconds? 15s gives better precision for "exact_time" reminders. 30s reduces DB load but adds 30s max drift.

2. **Should we fix the cancelReminder bug in this change?** Currently soft-deleted tasks still fire reminders (though the callback returns early if task not found). The new scheduler would include a working `cancelReminder` that sets `fired=1` in the DB. Should the DeleteTask/softDelete flow call `scheduler.cancelReminder(taskId)`? **Recommended: yes, fix it here.**

3. **Should occurrence counting be moved to DB?** Currently `occurrenceCount` for recurring tasks is tracked in the setTimeout callback closure. With DB polling, we should store `occurrence` on each `reminder_events` row. The `endAfterOccurrences` check reads the current row's `occurrence` value. **Recommended: yes, store in DB.**

4. **Media download in reminder callback:** Currently the reminder callback (main.ts lines 178–258) downloads media from Supabase, converts to base64, and sends via BaileysClient. This is a long-running operation. Should it also be concurrency-limited? **This is outside the scope of the BaileysClient concurrency change** — the reminder callback runs on the Node.js event loop, not inside the `on("message")` handler. But it's worth noting that multiple reminders firing simultaneously could saturate the Puppeteer instance.

5. **Should we add `node-cron` or any scheduling library?** No — the polling approach is simpler and more maintainable. Adding `node-cron` would mean learning its cron syntax, dealing with one-shot scheduling workarounds (node-cron is designed for recurring patterns), and still needing DB persistence.

6. **Do we need a migration file or is drizzle-kit push sufficient?** The project uses `drizzle-kit push` (see package.json line 15) which auto-generates DDL. Adding the table definition to the schema and running `drizzle-kit push` will create it. No manual migration file needed.

---

## 8. Ready for Next Phase

**Status:** Exploration complete. All files read, all patterns understood, all gaps identified.

**Recommended next phase:** `sdd-propose` — create the change proposal with scope, approach, and rollback plan.
