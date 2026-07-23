# Tasks: Recordatorios Frecuentes / Periódicos

## Phase 1: Infrastructure (DB + Domain)

- [x] 1.1 Add `RecurrenceFrequency` interface + Zod schema to `src/domain/entities/astral/Task.ts`
- [x] 1.2 Add optional `frequency` field to `Task` entity + `TaskSchema`
- [x] 1.3 Add nullable `frequency` text column to `packages/db-core/src/schema/tasks.ts`
- [x] 1.4 Run `drizzle-kit generate` to produce ALTER TABLE migration
- [x] 1.5 `tsc --noEmit` passes with new domain types

## Phase 2: Port + Scheduler

- [x] 2.1 Add `scheduleRecurringTask()` to `src/application/ports/ISchedulerService.ts`
- [x] 2.2 Implement `calculateNextOccurrence()` utility (daily/interval/weekly/monthly + clamp) in `src/infrastructure/scheduler/recurrence-utils.ts`
- [x] 2.3 Implement `scheduleRecurringTask()` logic (setTimeout + recalc per occurrence) in `NodeCronScheduler.ts`
- [x] 2.4 Add restart recovery for recurring tasks in `src/application/use-cases/astral/ReminderScheduler.ts`

## Phase 3: NLP

- [x] 3.1 Add `frequency` field to `ParsedTask` in `src/application/use-cases/astral/ParseNaturalLanguage.ts`
- [x] 3.2 Implement `extractFrequency()` regex fallback in `ParseNaturalLanguage.ts`
- [x] 3.3 Update AI prompt in `src/application/use-cases/astral/TimeParserService.ts` for frequency detection
- [x] 3.4 Update `CreateTaskFromNLP` to pass frequency to scheduler when present

## Phase 4: Controller + UI

- [x] 4.1 Update `AstralMenuService.promptForTask()` — neutral Spanish, voice note, recurring examples
- [x] 4.2 Add `frequencyConfigPrompt()` and `frequencyEndDatePrompt()` to menu service
- [x] 4.3 Update `reminderConfigPrompt()` to show option 5 for frequency
- [x] 4.4 Add `waiting_frequency_config` state + `handleFrequencyConfig()` in controller
- [x] 4.5 Add `waiting_frequency_end` state + `handleFrequencyEnd()` in controller
- [x] 4.6 Update `handleTaskConfirm()` to detect frequency from NLP and skip config
- [x] 4.7 Update `createTaskWithReminder()` to handle frequency parameter
- [x] 4.8 Add `parseReminderConfig()` validation for recurring (reject 1d/3h)

## Phase 5: Verify

- [x] 5.1 `tsc --noEmit` type check passes
- [x] 5.2 Structural verification complete — all 4 CRITICAL issues confirmed fixed. Runtime tests pass: validation (cross-field, offset guard), monthly clamping (Jan 31 → Feb 28), endAfterOccurrences enforcement.
- [x] 5.3 Monthly clamping verified: Jan 31 → Feb 28 ✅, Dec 31 → Jan 31 ✅, dayOfMonth:30 clamped to Feb 28 ✅
