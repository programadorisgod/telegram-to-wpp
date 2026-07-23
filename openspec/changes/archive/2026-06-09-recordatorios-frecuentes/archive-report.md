# Archive Report: recordatorios-frecuentes

**Archived**: 2026-06-09
**Phase**: SDD cycle complete (propose → spec → design → tasks → apply → verify → archive)

## Summary

Implemented recurring reminders for Recordar Todo — daily, interval, weekly, monthly frequency types with NLP detection, domain validation, monthly day clamping, and restart recovery. All 5 phases completed and verified.

## What Was Implemented

### Phase 1: Infrastructure (DB + Domain)
- `RecurrenceFrequency` Zod-validated value object with cross-field validation
- Nullable `frequency` TEXT column on Drizzle tasks schema
- `drizzle-kit generate` migration (`0002_closed_klaw.sql`)

### Phase 2: Port + Scheduler
- `scheduleRecurringTask()` on `ISchedulerService` port
- `calculateNextOccurrence()` utility — supports daily, interval, weekly, monthly with monthly day clamping
- `NodeCronScheduler` recurring logic: setTimeout + recalc per occurrence + `endAfterOccurrences` enforcement
- Restart recovery: skip past occurrences, schedule next future one

### Phase 3: NLP
- `frequency` field in `ParsedTask` interface
- `extractFrequency()` regex fallback in `ParseNaturalLanguage.ts`
- AI prompt additions in `TimeParserService.ts` for frequency detection
- `CreateTaskFromNLP` passes frequency to scheduler when present

### Phase 4: Controller + UI
- `waiting_frequency_config`, `waiting_frequency_detail`, `waiting_frequency_end` states
- `handleFrequencyConfig()`, `handleFrequencyEnd()` handlers
- Frequency config prompts in `AstralMenuService`
- Recurring examples in help text
- Validation: recurring tasks reject `oneDayBefore` / `threeHoursBefore` offsets

### Phase 5: Verify + Fixes
- 4 CRITICAL issues identified and fixed:
  1. Cross-field validation on `RecurrenceFrequencySchema` (rejects `{type:"daily", dayOfMonth:15}`)
  2. Monthly clamping: direct `new Date(year, month, day)` eliminates `setMonth` overflow
  3. Domain guard: `TaskSchema.refine()` rejects recurring tasks with invalid offsets
  4. `endAfterOccurrences` enforcement via occurrence counter in `scheduleOccurrence`

## Files Changed

| File | Action |
|------|--------|
| `src/domain/entities/astral/Task.ts` | +`RecurrenceFrequencySchema`, `FrequencyTypeEnum`, `frequency` field, cross-field validation refine, domain guard refine |
| `packages/db-core/src/schema/tasks.ts` | + nullable `frequency` text column |
| `packages/db-core/drizzle/0002_closed_klaw.sql` | + ALTER TABLE migration |
| `src/application/ports/ISchedulerService.ts` | +`scheduleRecurringTask()` |
| `src/infrastructure/scheduler/recurrence-utils.ts` | +`calculateNextOccurrence()`, `isWithinEndCondition()` |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | +`scheduleRecurringTask()` with setTimeout + recalc + occurrence counter |
| `src/application/use-cases/astral/ReminderScheduler.ts` | + restart recovery for recurring tasks |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | +`frequency` in `ParsedTask`, +`extractFrequency()` |
| `src/application/use-cases/astral/TimeParserService.ts` | + AI prompt for frequency detection |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | + frequency DTO + `scheduleRecurringTask` branch |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | + frequency config prompts, recurring examples |
| `src/interface/whatsapp/features/astral/AstralController.ts` | + `waiting_frequency_config`, `waiting_frequency_end` states + handlers |

## Current Status

**PASS** — All 4 CRITICAL issues verified fixed. TypeScript compiles cleanly (`tsc --noEmit`).

## Archived Artifacts

- `proposal.md` ✅
- `specs/recurring-reminders/spec.md` ✅ (synced to main specs)
- `specs/task-crud/spec.md` ✅ (merged into main specs)
- `specs/task-nlp/spec.md` ✅ (merged into main specs)
- `design.md` ✅
- `tasks.md` ✅ (24/24 tasks complete)
- `verify-report.md` ✅

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
