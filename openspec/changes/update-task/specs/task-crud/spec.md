# Delta for task-crud — Update Existing Tasks via NL Delta

## Change Summary

Replaces direct field updates with NL-delta flow: select task → NL delta → LLM merge → show diff → confirm → save + scheduler re-sync. Adds cancellation, fallback, not-found guards.

## ADDED Requirements

### Requirement: NL Delta Merge Flow

The system MUST support updating tasks by accepting a natural-language delta, merging with original task data via LLM, and presenting the diff for confirmation. Unmentioned fields SHALL persist unchanged.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Edit description | Task "comprar leche mañana 10am" | Delta "cambiar a leche descremada" | Description updated; date/time/freq unchanged; diff shown |
| Change time | Same task | Delta "mover a las 3pm" | Time→15:00; reminders cancelled then rescheduled after confirm |
| Add frequency | One-time "pagar tarjeta el 15 10am" | Delta "que sea todos los meses" | `frequency:{type:"monthly", dayOfMonth:15}`; becomes recurring |
| Change frequency | Daily recurring | Delta "semanal los lunes" | `frequency:{type:"weekly", daysOfWeek:[1]}`; old schedule cancelled |

### Requirement: Fallback on Merge Failure

If LLM returns invalid JSON or fails TaskSchema, the system SHOULD attempt regex extraction. If both fail, the system MUST ask the user to rephrase.

- GIVEN a pending task and user delta, WHEN LLM returns malformed JSON, THEN regex fallback attempted; if that also fails, user asked to rephrase.
- GIVEN a user delta, WHEN MidAI is unreachable, THEN regex fallback triggers and user notified.

### Requirement: Edit Cancellation & Guards

The user MUST cancel at any step (select task, see diff) and return to menu. If soft-deleted between listing and confirm, system shows "task not found".

- GIVEN a diff, WHEN user responds "no", THEN no changes persisted, return to menu.
- GIVEN a selected task, WHEN repo finds no record on confirm, THEN "task not found", return to menu.

## MODIFIED Requirements

### Requirement: Task Update

The system MUST support updating tasks via NL delta: select task → send delta → LLM merge (regex fallback) → show diff → confirm → save. Changing `scheduledAt`/`frequency` SHALL cancel old reminders and register new ones.
(Previously: direct field update without NL merge)

#### Scenario: Confirm with scheduler re-sync

- GIVEN a diff presented
- WHEN user confirms ("sí")
- THEN old reminders cancelled, merged task persists (passes TaskSchema), new reminders scheduled

### Requirement: Frequency Update

The system MUST support updating `frequency` via NL merge. Setting to NULL SHALL convert recurring to one-time. Changing frequency SHALL cancel old schedule and register new occurrences.
(Previously: direct frequency update without NL merge)

#### Scenario: Remove frequency

- GIVEN a daily recurring task
- WHEN user sends "que sea solo una vez" and confirms
- THEN `frequency`→NULL, future occurrences cancelled, task becomes one-time

## Validation Rules

Merged output MUST pass `TaskSchema` Zod: description 1–500 chars, scheduledAt a valid future datetime, frequency valid `RecurrenceFrequency` | null, reminderConfig subset of `["1d","3h","1h","exact"]`. Recurring tasks MUST NOT use `oneDayBefore`/`threeHoursBefore`.

## Scheduler Behavior

| Condition | Cancel old | Schedule new |
|-----------|-----------|-------------|
| `scheduledAt` changed | YES | YES |
| `frequency` changed | YES | YES |
| `reminderConfig` changed | YES | YES |
| Only `description` changed | NO | NO |
| User cancels | NO | NO |

On confirmed schedule change: `cancelReminder(taskId)` → persist → `scheduleTaskReminder` (one-time) or `scheduleRecurringTask` (recurring).

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF1 | AI merge failure MUST NOT leave task partially-updated (transactional) |
| NF2 | `tsc --noEmit` MUST pass |
| NF3 | Existing NLP creation pipeline MUST work unchanged |
