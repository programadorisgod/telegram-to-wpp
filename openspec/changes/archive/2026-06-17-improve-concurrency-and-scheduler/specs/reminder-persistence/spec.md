# Reminder Persistence Specification

## Purpose

Define persistent reminder event storage and DB polling scheduler. Reminder events survive process restarts, replace in-memory setTimeout scheduling, and support soft-delete cancellation.

## Requirements

### Requirement: Reminder Event Storage

The system MUST store every scheduled reminder as a row in `reminder_events` with fields: event ID, task ID, scheduled time, status (pending/fired/cancelled), and optional recurrence metadata. Only pending events SHALL be polled for firing.

#### Scenario: Event created on schedule

- GIVEN a task with a reminder time
- WHEN the scheduler registers the reminder
- THEN a `reminder_events` row is inserted with status `pending` and the correct scheduled time

#### Scenario: Cancelled event excluded from polling

- GIVEN a task is soft-deleted with a pending reminder
- WHEN cancelReminder() is called
- THEN the corresponding `reminder_events` row status is set to `cancelled`
- AND the event is excluded from future polling queries

### Requirement: DB Poll Scheduler

The system MUST implement a polling scheduler that queries for due events at a configurable interval (default 15s), fires their callbacks, and marks rows as `fired`. The scheduler SHALL implement the `ISchedulerService` interface.

#### Scenario: Due event fires on next poll

- GIVEN a `reminder_events` row with scheduled time 10:00:00
- WHEN the poll runs at 10:00:12
- THEN the reminder callback fires
- AND the row status is updated to `fired`

#### Scenario: Polling interval tolerance

- GIVEN a reminder scheduled at 10:00:00 with a 15s poll interval
- WHEN the last poll was at 09:59:58
- THEN the reminder fires no later than 10:00:13 (within one poll interval)

### Requirement: Recurring Event Chaining

After firing a recurring reminder event, the system MUST insert the next occurrence as a new `pending` row. The next scheduled time SHALL be calculated using the same recurrence rules as the existing `recurring-reminders` spec.

#### Scenario: Next occurrence inserted after fire

- GIVEN a daily recurring task fires at 09:00
- WHEN the 09:00 event is marked `fired`
- THEN a new `pending` row is inserted for 09:00 the next day

#### Scenario: End condition respected

- GIVEN a recurring task with `endAfterOccurrences: 3` and 2 already fired
- WHEN the 3rd occurrence fires
- THEN no new row is inserted

### Requirement: Boot Migration

On application startup, the system MUST scan existing tasks with pending reminders and insert corresponding `reminder_events` rows. This replaces the previous setTimeout re-registration.

#### Scenario: Pending tasks migrated on boot

- GIVEN 5 tasks with pending reminders exist in the `tasks` table
- WHEN the application starts
- THEN 5 `reminder_events` rows are inserted with status `pending`
- AND no setTimeout entries are created

#### Scenario: Already-fired tasks skipped

- GIVEN a recurring task with its last occurrence already fired
- WHEN boot migration runs
- THEN only the next future occurrence is inserted, not past ones

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Latency | Reminders SHALL fire within one poll interval (configurable, default 15s) of their scheduled time |
| NF2 | Crash recovery | All pending reminders MUST survive process termination and be re-registered on next boot |
| NF3 | Interface | DbPollScheduler MUST implement `ISchedulerService` with identical method signatures as the replaced scheduler |
