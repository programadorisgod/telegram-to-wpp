## Exploration: Multi-Schedule Recurring Tasks

### Current State

The system supports a **single `RecurrenceFrequency` per Task** — one `type` with one set of parameters (days of week, interval, etc.). There is only one `datetime` per task, meaning ALL weekly occurrences fire at the SAME time on ALL selected days.

**Concrete example of the limitation**: "recuérdame lunes a viernes a las 16:40, sábados a las 11:30, domingos a las 17:00" has **three distinct schedules with different times** on different day subsets. The current model forces you to create three separate tasks (one per schedule), flooding the user's task list and making cancellation cumbersome.

**Domain model** (`src/domain/entities/astral/Task.ts`):
- `RecurrenceFrequency` is a Zod-validated discriminated union on `type` field
- Types: `daily`, `interval`, `weekly`, `monthly`
- Fields: `type` (required), `interval`, `timesPerDay`, `daysOfWeek` (number[]), `dayOfMonth`, `endDate`, `endAfterOccurrences`
- Conflicts enforced via `.refine()` — e.g., `weekly` cannot have `dayOfMonth` or `timesPerDay`
- One `frequency` field per Task (nullable — null = one-time)

**DB schema** (`packages/db-core/src/schema/tasks.ts`):
- `frequency` is a `text` column (JSON-serialized `RecurrenceFrequency`)
- No separate table for schedules; frequency lives inline on the task

**Scheduler** (`src/infrastructure/scheduler/DbPollScheduler.ts`):
- `scheduleRecurringTask()` calls `insertEventsForTask()` once per occurrence
- `insertEventsForTask()` generates reminder_event rows from the single `datetime` + offsets
- `scheduleNextOccurrence()` calls `calculateNextOccurrence()` which advances based on type:
  - `weekly`: finds next day from `daysOfWeek` array, advances by N days → SAME time preserved

**Recurrence utils** (`src/infrastructure/scheduler/recurrence-utils.ts`):
- `calculateNextOccurrence()`: for `weekly`, finds next day-of-week after lastDt, advances by day count. Uses `lastDt.getTime() + daysToAdd * 86400000` — preserves hour/minute from lastDt.
- `isWithinEndCondition()`: checks `endDate` only
- `endAfterOccurrences` checked in `scheduleNextOccurrence` by counting fired events

### Affected Areas

| File | Why affected |
|------|-------------|
| `src/domain/entities/astral/Task.ts` | `RecurrenceFrequencySchema` needs a new `schedules` field on `weekly` type (array of `{daysOfWeek, time}`). Validation rules and conflict checks must be updated. |
| `packages/db-core/src/schema/tasks.ts` | No schema change needed — `frequency` remains a text/JSON column. |
| `packages/db-core/src/schema/reminder_events.ts` | No schema change needed — `reminder_events` already stores individual fire times. |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | `scheduleRecurringTask` must expand multiple schedules into multiple event sets. `scheduleNextOccurrence` must handle the new weekly variant. |
| `src/infrastructure/scheduler/recurrence-utils.ts` | `calculateNextOccurrence()` for `weekly` must support per-day time overrides. |
| `src/application/use-cases/astral/TimeParserService.ts` | AI system prompt must teach the model to output multi-schedule frequency JSON. |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | `extractFrequency()` regex must match multi-schedule patterns (e.g., "lunes a viernes a las X, sábados a las Y"). |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | No logic change needed — just passes frequency through. |
| `src/application/use-cases/astral/ReminderScheduler.ts` | `scheduleOne()` and `reRegisterPendingReminders()` use `scheduleRecurringTask` — no change needed since the scheduler handles the expansion internally. |
| `src/application/ports/ISchedulerService.ts` | Interface unchanged — `scheduleRecurringTask` already accepts `RecurrenceFrequency`. |
| `openspec/specs/recurring-reminders/spec.md` | Add scenario for multi-schedule weekly tasks. |

### Approaches

#### 1. Add `schedules` field to the `weekly` frequency type (recommended)

Extend the existing `weekly` variant of `RecurrenceFrequency` with an optional `schedules` array. Each entry is `{daysOfWeek: number[], time: string}`. When `schedules` is present, it supersedes the single `daysOfWeek` + `datetime` combination. The scheduler expands each schedule entry into its own set of reminder_event rows.

```typescript
// New type
const WeeklyScheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

// Updated weekly
{ type: "weekly", schedules?: WeeklyScheduleSchema[], daysOfWeek?: number[] }
```

**Pros:**
- Minimal domain model change — backward compatible (existing weekly tasks with `daysOfWeek` still work)
- One task semantically represents one recurring concept — correct UX
- No DB migration needed (JSON column absorbs new shape)
- No API-breaking changes (interface unchanged)
- `weekly` type is the ONLY type that benefits from multi-schedule (daily/interval/monthly don't have day-varying times)

**Cons:**
- Scheduler complexity: must iterate schedules array, calculate next occurrence per schedule
- Need conflict validation: `schedules` and `daysOfWeek` must be mutually exclusive
- Per-schedule end-date tracking is tricky (currently one `endDate` for the whole frequency)

**Effort:** Medium — 4-6 files changed, no DB migration

---

#### 2. Split into N tasks at creation time

When NLP detects multi-schedule input, create N separate tasks (one per schedule) and optionally group them with a shared `groupId` or parentId.

**Pros:**
- ZERO domain model changes
- ZERO scheduler changes
- Each task independently tracks its own end conditions and occurrences

**Cons:**
- User sees 3+ tasks instead of 1 — pollutes task list
- Cancelling requires N separate operations (or a new "cancel group" feature)
- No semantic grouping for "list" queries
- "edit task X" becomes ambiguous (which one?)
- Each task has its own `exact_time` event → if exact_time triggers task deletion, other schedules for the "same" recurrence are untouched — inconsistent

**Effort:** Low for implementation, High for UX cost

---

#### 3. Normalize to a `schedules` table in DB

Add a `task_schedules` table with `taskId`, `daysOfWeek`, `time`, and `endDate` columns. The task's `frequency` column becomes a marker for "this task has schedules." The scheduler joins this table.

**Pros:**
- Queryable, indexable — can find all tasks that fire on a given day/time
- Relational integrity (FK to tasks)
- Clean separation of concerns

**Cons:**
- DB migration required (new table)
- More code to maintain (repository methods, schema)
- Overkill for `reminder_events`-based scheduling (events table already handles per-fire tracking)
- The `tasks.frequency` JSON approach has been working fine

**Effort:** High — DB migration, new repository methods, join queries

### Recommendation

**Approach 1** — extend `weekly` frequency with an optional `schedules` array.

Rationale:
- The problem is scoped to `weekly` type only (daily/interval/monthly don't vary by day)
- No DB migration, just JSON shape evolution
- Backward compatible — existing tasks unaffected
- One task = one concept for the user
- `reminder_events` table already tracks individual fires — no persistence change needed

The `endDate` and `endAfterOccurrences` fields apply to the entire frequency (all schedules share them), which matches user intent: "recuérdame X hasta el viernes" naturally applies to all sub-schedules.

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Scheduler bug: wrong next occurrence calculation** | High | The current `calculateNextOccurrence` for weekly only looks at `daysOfWeek` and preserves time from `baseDt`. With `schedules`, we must: (1) find which schedule entries have a day-of-week past the current day, (2) for each, calculate next fire date independently, (3) pick the earliest one. Needs thorough unit testing (or integration testing with actual event creation). |
| **AI system prompt regression** | Medium | The current prompt defines a flat `frequency` JSON shape. Multi-schedule requires the model to output `{type:"weekly", schedules:[{daysOfWeek:[1,2,3,4,5],time:"16:40"},{daysOfWeek:[6],time:"11:30"},{daysOfWeek:[7],time:"17:00"}]}`. This is a non-trivial structural change for an LLM. The safety net in `TimeParserService` (regex fallback on AI failure) MUST also support multi-schedule extraction. |
| **Conflict between schedules and daysOfWeek** | Low | Zod `.refine()` rejects conflicting fields. Already a pattern in the codebase. |
| **End condition edge cases** | Low | `endAfterOccurrences` counting becomes ambiguous: does "after 10 occurrences" mean 10 total across all schedules or 10 per schedule? Default: 10 total. This is a product decision, not a technical one. |
| **No test infrastructure** | Medium | The project has no test framework installed. Scheduler changes without tests are risky. Consider adding a minimal `vitest` setup OR relying on `tsc --noEmit` + manual integration testing. |

### Complexity Estimate

- **Domain model change**: ~30 lines (new `WeeklyScheduleSchema`, updated `weekly` type)
- **Scheduler change**: ~60 lines (iterate schedules, find next fire per schedule)
- **Recurrence utils change**: ~80 lines (new `calculateNextWeeklyOccurrence` for multi-schedule)
- **AI prompt change**: ~20 lines (frequency section + example)
- **Regex NLP change**: ~40 lines (multi-schedule pattern matching)
- **Total**: ~230 lines across 5 files, no DB migration, no new dependencies

### Ready for Proposal

Yes — this is well-scoped and the domain boundaries are clear. The orchestrator should proceed to `sdd-propose` for this change. Suggested change name: `multi-schedule-recurring`.
