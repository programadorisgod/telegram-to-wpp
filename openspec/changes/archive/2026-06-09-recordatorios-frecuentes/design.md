# Design: Recordatorios Frecuentes / Periódicos

## Technical Approach

Add a `RecurrenceFrequency` JSON value object to the domain layer and a nullable JSON `frequency` column to the Drizzle tasks schema. Extend `ISchedulerService` with `scheduleRecurringTask()` — a separate code path that uses setTimeout + recalc-per-occurrence rather than node-cron. NLP layer (AI + regex fallback) extracts frequency patterns from Spanish text. On restart, skip past occurrences and schedule the next future one. One-time flow is completely untouched.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| ADR-1 | Frequency model | `RecurrenceFrequency` Zod-validated interface, nullable JSON column | Separate table, enum column | Flexible for all patterns, no schema changes per type, Zod guards on read/write |
| ADR-2 | Scheduling mechanism | setTimeout + recalc on each occurrence | node-cron, bree, bull | Simpler than managing N cron expressions per task; timesPerDay doesn't map to cron. Timeout drift over years mitigated by restart recalc |
| ADR-3 | Port method | `scheduleRecurringTask(taskId, datetime, frequency)` on `ISchedulerService` | Reuse existing `scheduleTaskReminder` | One-time flow completely unchanged; clearer contract. Both share `cancelReminder` and `onReminder` |
| ADR-4 | Valid offsets | Recurring: only `oneHourBefore` + `exactTime` | All offsets available | "Remind me 1 day before a daily task" is confusing. Validation in controller + domain layer |
| ADR-5 | Restart behavior | Skip past occurrences, schedule next future from "now" | Catch-up missed occurrences | Simpler, matches user expectation (no spam backlog). Documented behavior |

## Data Model

```
interface RecurrenceFrequency {
  type: "daily" | "interval" | "weekly" | "monthly";
  interval?: number;           // every N days (daily/interval) or N weeks (weekly)
  timesPerDay?: number;        // 3 = 3 evenly spaced occurrences per day
  daysOfWeek?: number[];       // 1=Monday..7=Sunday
  dayOfMonth?: number;         // 1-31, clamped to last valid day of month
  endDate?: string | null;     // ISO date, null = indefinite
  endAfterOccurrences?: number | null;
}
```

Integrated into `Task` entity: new optional `frequency?: RecurrenceFrequency` field. Drizzle: `frequency` TEXT column (nullable, stores JSON). `ReminderConfig` validation: recurring tasks reject `oneDayBefore` and `threeHoursBefore`.

## Scheduler Algorithm

`scheduleRecurringTask(taskId, baseDatetime, config, frequency)`:

1. Cancel existing jobs for taskId (same as `scheduleTaskReminder`)
2. For each valid offset (`oneHourBefore`, `exactTime`):
   - Calculate fire time from `baseDatetime + offset`
   - If in past, skip (restart case)
   - Schedule setTimeout that fires reminder + calls `onNextOccurrence()`

`onNextOccurrence(taskId, lastDatetime, frequency)`:

1. `nextDt = calculateNextOccurrence(lastDatetime, frequency)`
2. If `nextDt > endDate` or occurrences >= `endAfterOccurrences` → stop
3. Else: schedule new timeouts for nextDt's offsets

`calculateNextOccurrence` per type:

| Type | Logic |
|------|-------|
| `daily` | `lastDt + 24h / timesPerDay` when spacing, else `lastDt + 24h * interval` |
| `interval` | `lastDt + interval * 24h` |
| `weekly` | Walk forward to next `daysOfWeek` member after lastDt |
| `monthly` | Same day-of-month next month; clamp 29-31 to month's last day |

### Monthly clamping

```
function clampDayOfMonth(year, month, day):
  lastDay = daysInMonth(year, month)   // 28,29,30,31
  return Math.min(day, lastDay)
```

## Controller Flow

```
waiting_task_raw → waiting_task_confirm
  → handleTaskConfirm:
    ├─ frequency en NLP: createTaskWithReminder (auto, skip config)
    ├─ short-term (<2h): createTaskWithReminder (exactTime only)
    ├─ long-term: → waiting_reminder_config (new option 5: "frecuencia")
      └─ option 5 → waiting_frequency_config
         → handleFrequencyConfig:
           └─ ask endDate → waiting_frequency_end
             → handleFrequencyEnd → createTaskWithReminder (with frequency)
```

New states: `astral::waiting_frequency_config`, `astral::waiting_frequency_end`. New handler methods: `handleFrequencyConfig`, `handleFrequencyEnd`.

## NLP Changes

**AI prompt additions** (`TimeParserService.ts` SYSTEM_PROMPT):

```
12. Detectar frecuencia: "3 veces al día" → añadir frequency a la respuesta
    Formato: "frequency": {"type":"daily","timesPerDay":3}
    - "todos los días", "cada día" → {"type":"daily"}
    - "cada 2 días" → {"type":"interval","interval":2}
    - "todos los lunes" → {"type":"weekly","daysOfWeek":[1]}
    - "todos los 30" → {"type":"monthly","dayOfMonth":30}
    - "durante esta semana" → añadir endDate
13. Si no hay frecuencia, "frequency": null
```

**`ParsedTask`** gains `frequency?: RecurrenceFrequency`. **Regex fallback** (`ParseNaturalLanguage.ts`): new `extractFrequency()` function with patterns for each type. Strips matched tokens from description.

## Migration Plan

1. Add `frequency` column to `packages/db-core/src/schema/tasks.ts`:
   ```ts
   frequency: text("frequency"),  // nullable JSON, null = one-time
   ```
2. `drizzle-kit generate` → creates ALTER TABLE migration SQL
3. Migration runs on next `db:push` or migration script execution
4. All existing tasks have NULL → no data migration needed

## Sequence Diagrams

### Creating recurring task via NLP

```
User ──text──→ AstralController
  ├── handleRawTask ──→ TimeParserService (returns parsed + frequency)
  ├── show confirmation
  ├── handleTaskConfirm
  │   └── (frequency detected) → createTaskWithReminder
  │       └── CreateTaskFromNLP.execute()
  │           ├── taskRepo.save(task) ──→ DB
  │           └── scheduler.scheduleRecurringTask()
  │               └── NodeCronScheduler: setTimeout → fireAt
  └── "Tarea creada" → User
```

### Firing occurrence + scheduling next

```
setTimeout fires
  → NodeCronScheduler: fireReminder()
    → ReminderScheduler callback
      → send WhatsApp message to user
  → calculateNextOccurrence(lastDt, frequency)
    └── nextDt = daily + 24h
    └── if nextDt <= endDate:
        schedule timeouts for nextDt offsets
```

### Restart recovery

```
ReminderScheduler.reRegisterPendingReminders()
  → taskRepo.findPendingReminders()  (WHERE deleted_at IS NULL AND frequency IS NOT NULL)
  → for each task:
      if task.frequency:
        nextDt = calculateNextOccurrence(task.datetime, frequency)
        while nextDt < now:  // skip past
          nextDt = calculateNextOccurrence(nextDt, frequency)
        scheduler.scheduleRecurringTask(task.id, nextDt, config, frequency)
```

## File Changes

| File | Action |
|------|--------|
| `src/domain/entities/astral/Task.ts` | +`RecurrenceFrequency` interface + Zod schema, +`frequency` field |
| `src/application/ports/ISchedulerService.ts` | +`scheduleRecurringTask()` method |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | +recurring logic: recalc, monthly clamp |
| `src/application/use-cases/astral/ReminderScheduler.ts` | +re-register recurring tasks on restart |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | +pass frequency to scheduler |
| `src/application/use-cases/astral/TimeParserService.ts` | +AI frequency detection prompt |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | +`frequency` in `ParsedTask`, +`extractFrequency()` |
| `src/interface/whatsapp/features/astral/AstralController.ts` | +`waiting_frequency_config`, +`waiting_frequency_end` states |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | +frequency config prompts, +examples in help |
| `packages/db-core/src/schema/tasks.ts` | +`frequency` column (nullable TEXT) |

## Testing Strategy

No test framework installed per config. Quality gates: `tsc --noEmit` must pass. Manual testing scenarios: daily/interval/weekly/monthly fire at correct times, monthly clamping (Feb 30 → 28/29), restart skip-past, NLP extraction of each pattern, one-time regression.

## Open Questions

- None — all decisions captured in ADRs above.
