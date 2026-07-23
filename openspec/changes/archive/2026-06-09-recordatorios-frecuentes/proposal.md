# Proposal: Recordatorios Frecuentes / Periódicos

## Intent

Users want recurring reminders — daily, weekly, monthly, multiple times per day — instead of only one-shot tasks. Current system only supports offset-based one-time alerts (1d/3h/1h/exact). This adds `RecurrenceFrequency` value object + new `scheduleRecurringTask()` port method to support all recurring patterns without touching the one-time flow.

## Scope

### In Scope
- `RecurrenceFrequency` value object in domain (daily/interval/weekly/monthly types)
- New `scheduleRecurringTask()` in `ISchedulerService` port
- Recurring scheduling logic in `NodeCronScheduler` (setTimeout + recalc pattern)
- NLP/AI frequency detection from natural language ("3 veces al día", "todos los días", "todos los 30")
- New `frequency` column in Drizzle tasks schema
- New `waiting_frequency_config` state in AstralController + menu prompts
- Neutral Spanish UX, voice note mention in prompt, recurring examples in help

### Out of Scope
- Periodic project reminders (existing `scheduleProjectReminder` stub separate)
- Calendar integration (Google Calendar sync, etc.)
- Email reminders
- Skip-pattern exceptions ("excepto los viernes")

## Capabilities

### New Capabilities
- `recurring-reminders`: Recurrence scheduling, value object, restart recovery, monthly clamping

### Modified Capabilities
- `task-crud`: Frequency column on tasks schema; recurring tasks created as periodic instead of one-off
- `task-nlp`: Frequency pattern extraction from Spanish natural language input

## Approach

Custom `RecurrenceFrequency` value object in domain layer. Separate `scheduleRecurringTask(datetime, frequency)` port method (leaves one-time flow untouched). `NodeCronScheduler` uses setTimeout + recalc-per-occurrence (not node-cron). NLP layer detects patterns from text ("todos los días", "3 veces al día", "todos los 30"). On restart: skip past occurrences, only schedule future ones. Monthly day 29-31 clamps to last day of shorter months.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/domain/entities/astral/Task.ts` | Modified | New `RecurrenceFrequency` value object + schema |
| `src/application/ports/ISchedulerService.ts` | Modified | New `scheduleRecurringTask(taskId, datetime, frequency)` |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Modified | Recurring logic: setTimeout + recalc per occurrence |
| `src/application/use-cases/astral/ReminderScheduler.ts` | Modified | Re-register recurring tasks on restart |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | Modified | Pass detected frequency to scheduler |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | Modified | Frequency pattern extraction |
| `src/application/use-cases/astral/TimeParserService.ts` | Modified | AI-based frequency detection |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | New `waiting_frequency_config` state + handlers |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Modified | Neutral Spanish, voice note mention, recurring examples |
| `packages/db-core/src/schema/tasks.ts` | Modified | New `frequency` column (nullable JSON text) |
| `packages/db-core/src/schema/index.ts` | Modified | Re-export new types if needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Monthly clamping (29-31) produces unexpected dates | Med | Log clamped dates; user-facing warning if clamped |
| Recurring + one-time offset interaction confusing | Low | For recurring: only oneHourBefore + exactTime (no 1d/3h) |
| Restart skips missed occurrences — user expects catch-up | Low | Documented behavior; skip-past is intentional |

## Rollback Plan

1. Revert Drizzle migration: remove `frequency` column from tasks table
2. Revert `ISchedulerService`: remove `scheduleRecurringTask()` from interface
3. Revert `NodeCronScheduler`: remove recurring case from all methods
4. Revert `AstralController`: remove `waiting_frequency_config` state and handlers
5. Revert `AstralMenuService`: remove recurring prompts
6. Revert NLP layer: remove frequency extraction patterns

## Dependencies

- `node-cron` (already installed) — optional for daily constant-interval tasks; setTimeout approach preferred for simplicity

## Success Criteria

- [ ] Recurring task fires at correct intervals (daily/weekly/monthly/N-times-daily)
- [ ] Monthly day clamping works for Feb 30 → Feb 28/29
- [ ] NLP detects frequency patterns from natural Spanish text
- [ ] Restart skips past occurrences, schedules future ones
- [ ] One-time reminders continue working unchanged (regression-free)
- [ ] `tsc --noEmit` passes
