# Delta for Recurring Reminders

## MODIFIED Requirements

### Requirement: Restart Recovery

On restart, the scheduler MUST re-register pending reminders by inserting `reminder_events` rows from the `tasks` table during boot migration. Past occurrences SHALL be skipped and only the next future occurrence inserted. This replaces the previous in-memory setTimeout re-registration.

(Previously: Re-registered reminders via in-memory setTimeout with a timing gap on boot)

#### Scenario: Skip past on restart

- GIVEN a daily task at 08:00 that last fired yesterday
- WHEN system restarts at 14:00 today
- THEN a `reminder_events` row is inserted for tomorrow's 08:00
- AND no row is created for today's already-passed 08:00

#### Scenario: No timing gap on boot

- GIVEN multiple pending reminders exist in the `tasks` table
- WHEN the application starts
- THEN all corresponding `reminder_events` rows are inserted synchronously before the poll loop begins

## REMOVED Requirements

### Requirement: Database Migration (frequency column)

(Reason: Superseded by the `reminder-persistence` spec which defines the `reminder_events` table as the scheduling backend. The `tasks.frequency` column remains for recurrence metadata but is no longer the scheduling mechanism.)
