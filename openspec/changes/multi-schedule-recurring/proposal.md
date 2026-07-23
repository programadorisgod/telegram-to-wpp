# Proposal: Multi-Schedule Recurring Tasks

## Intent

Users want recurring reminders with **different times on different days**, e.g. "recuérdame lunes a viernes a las 16:40, sábados a las 11:30, domingos a las 17:00". Currently the system supports only ONE schedule per recurring task — same time on all selected days. Workaround requires creating N separate tasks, polluting the task list and making cancellation cumbersome.

## Scope

### In Scope
- Add optional `schedules` array to the `weekly` frequency type (`{daysOfWeek: number[], time: "HH:mm"}`)
- Rewrite `calculateNextOccurrence()` for weekly to find earliest next fire across all schedule entries
- Update `insertEventsForTask()` to expand per-schedule times into reminder_event rows
- Add multi-schedule examples to AI system prompt and regex NLP fallback

### Out of Scope
- DB schema changes (not needed — `frequency` is already JSON text)
- `daily`, `interval`, `monthly` frequency types (only `weekly` benefits)
- Test infrastructure (no framework exists)
- Per-schedule end conditions (`endDate`/`endAfterOccurrences` apply globally)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `recurring-reminders`: Weekly frequency type gains optional `schedules` array; `calculateNextOccurrence` must resolve earliest next fire across multiple schedules; `insertEventsForTask` must generate events per schedule entry

## Approach

Extend the existing `weekly` variant of `RecurrenceFrequency` with an optional `schedules: WeeklyScheduleSchema[]` field. Each entry is `{daysOfWeek: number[], time: "HH:mm"}`. When `schedules` is present, it supersedes the single `daysOfWeek` + `datetime` combination. Zod `.refine()` enforces mutual exclusion between `schedules` and `daysOfWeek`. The scheduler iterates schedule entries, calculates next fire date per entry, and picks the earliest. `endDate` and `endAfterOccurrences` apply globally across all schedules.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/domain/entities/astral/Task.ts` | Modified | Add `WeeklyScheduleSchema`, optional `schedules` field to weekly type, conflict validation |
| `src/infrastructure/scheduler/recurrence-utils.ts` | Modified | Rewrite weekly `calculateNextOccurrence()` for multi-schedule resolution |
| `src/infrastructure/scheduler/DbPollScheduler.ts` | Modified | `insertEventsForTask()` expands per-schedule times into events |
| `src/application/use-cases/astral/TimeParserService.ts` | Modified | Add multi-schedule frequency example to SYSTEM_PROMPT |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | Modified | `extractFrequency()` detects multi-schedule patterns as regex safety net |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong next-occurrence calculation across schedules | Medium | Iterate each schedule independently, pick earliest; validate with manual integration tests |
| AI prompt fails to output correct `schedules` JSON | Medium | Regex NLP fallback covers common patterns; explicit JSON examples in prompt |
| `endAfterOccurrences` ambiguity (total vs per-schedule) | Low | Default: total across all schedules — matches user intent |
| Existing weekly tasks break | Low | `schedules` is optional; existing `daysOfWeek`-only tasks unchanged |

## Rollback Plan

Remove the `schedules` field from `WeeklyScheduleSchema` and revert `calculateNextOccurrence()` and `insertEventsForTask()` to their previous logic. Since no DB migration is needed, rollback is purely code-level — existing tasks with `schedules` in their JSON will be ignored (graceful degradation, they fall back to `daysOfWeek` if present, or no schedule fires if only `schedules` existed — edge case requiring manual task recreation).

## Dependencies

- None (no new packages, no DB migration)

## Success Criteria

- [ ] User can create a weekly task with multiple schedules via NLP ("lunes a viernes a las 16:40 y sábados a las 11:30")
- [ ] Each schedule fires at its configured time on its configured days
- [ ] `calculateNextOccurrence()` returns the correct earliest next fire across all schedules
- [ ] Existing single-schedule weekly tasks continue working unchanged
- [ ] `tsc --noEmit` passes with no type errors
