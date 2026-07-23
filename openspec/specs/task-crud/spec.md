# Task CRUD Specification

## Purpose

Define task creation, reading, update, and deletion with combinable reminder configuration. Tasks are owned by a user (chatId) and optionally belong to a project.

## Requirements

### Requirement: Task Creation

The system MUST create tasks with description, scheduled date/time, a combinable reminder config, and an OPTIONAL `scheduledFor` recipient ID. When `scheduledFor` is omitted or NULL, the reminder routes to the task creator. Reminder options are: 1 day before, 3 hours before, 1 hour before, at exact time — any combination.

#### Scenario: Create with multiple reminders (unchanged)

- GIVEN a confirmed NLP-parsed task and reminder config `{ reminders: ["1d", "1h"] }`
- WHEN the system persists the task
- THEN a task record is created with `reminderConfig: ["1d", "1h"]`
- AND the scheduler registers two cron jobs for that task

#### Scenario: Create with exact-time reminder only (unchanged)

- GIVEN reminder config `{ reminders: ["exact"] }`
- WHEN the system persists the task
- THEN a single reminder fires at the task's scheduled time

#### Scenario: No reminders selected (unchanged)

- GIVEN reminder config `{ reminders: [] }`
- WHEN the system persists the task
- THEN the task is saved with no scheduled reminders (silent task)

#### Scenario: Create with scheduledFor and reminders

- GIVEN a confirmed NLP-parsed task, `reminderConfig: ["1d", "1h"]`, and `scheduledFor = "5491112345678@c.us"`
- WHEN the system persists the task
- THEN a task record is created with `reminderConfig: ["1d", "1h"]` and `scheduledFor: "5491112345678@c.us"`
- AND the scheduler registers two cron jobs targeting the contact

### Requirement: Recurring Task Creation

The system MUST support creating tasks with an OPTIONAL `frequency` field. When `frequency` is present, the task SHALL be scheduled as recurring. The `reminderConfig` for recurring tasks MUST be limited to `["oneHourBefore", "exactTime"]`.

#### Scenario: Create daily recurring task

- GIVEN a confirmed NLP-parsed task with `frequency: {type:"daily", timesPerDay:2}` and `reminderConfig:["exactTime"]`
- WHEN the system persists the task
- THEN a task record is created with the `frequency` JSON column populated
- AND the scheduler registers a recurring schedule instead of one-time cron jobs

#### Scenario: Recurring with invalid offset rejected

- GIVEN a recurring task and `reminderConfig:["1d"]`
- WHEN validating before persist
- THEN the system returns a validation error

### Requirement: Reminder Routing by Recipient

The scheduler MUST route reminder messages to `scheduledFor` when present, falling back to the task owner (`userId`). This SHALL be transparent to existing sender logic.

#### Scenario: Reminder delivered to contact

- GIVEN a task with `scheduledFor = "5491112345678@c.us"`
- WHEN the reminder fires
- THEN the message is sent to the contact's WhatsApp ID

#### Scenario: Reminder delivered to creator (backward compat)

- GIVEN a task with `scheduledFor = NULL`
- WHEN the reminder fires
- THEN the message is sent to `task.userId` (existing behavior unchanged)

### Requirement: Reminder Combinability

The four reminder options (`"1d"`, `"3h"`, `"1h"`, `"exact"`) MUST be combinable in any subset. The `"exact"` option SHALL be mutually compatible with any combination of the other three.

#### Scenario: All four combined

- GIVEN a task with `reminderConfig: ["1d", "3h", "1h", "exact"]`
- WHEN the task is saved
- THEN four cron jobs are registered at the appropriate offsets

### Requirement: Task Retrieval

The system MUST support listing all tasks for a user, optionally filtered by status (pending/completed). Recurring tasks SHALL appear once in the listing, showing the next pending occurrence.
(Previously: no recurrence concept — tasks appeared as one-shot entries)

#### Scenario: List pending tasks (updated)

- GIVEN a user with 5 tasks (3 pending of which 1 is recurring, 2 completed)
- WHEN the user requests pending tasks
- THEN the system returns 3 entries, ordered by next-occurrence date ascending
- AND the recurring task shows its frequency info inline

### Requirement: Task Update

The system MUST support updating task description, date/time, and reminder config. Updating date/time SHALL re-register all reminder cron jobs.

#### Scenario: Reschedule with reminder re-registration

- GIVEN a task with existing reminders
- WHEN the user updates the scheduled date
- THEN old cron jobs are removed and new ones are registered at the updated offsets

### Requirement: Frequency Update

The system MUST support updating the `frequency` field on existing tasks. Setting `frequency` to NULL SHALL convert a recurring task to one-time (future occurrences cancelled). Changing frequency SHALL recalculate all upcoming occurrences.

#### Scenario: Remove frequency converts to one-time

- GIVEN an existing daily recurring task
- WHEN user updates `frequency` to NULL
- THEN all future recurring occurrences are cancelled
- AND the task behaves as a one-time task

### Requirement: Task Deletion

The system MUST support soft-deleting a task (marked as `deleted_at` set). Deleted tasks SHALL NOT appear in listings.

#### Scenario: Soft delete

- GIVEN an existing task
- WHEN the user confirms deletion
- THEN `deleted_at` is set to current timestamp
- AND all associated cron jobs are unregistered
- AND the task does not appear in pending/completed listings

### Requirement: Cancel Future Occurrences on Delete

When soft-deleting a recurring task, the system MUST cancel ALL future scheduled occurrences.

#### Scenario: Delete recurring task

- GIVEN a daily recurring task with pending occurrences
- WHEN the user confirms deletion
- THEN the task is soft-deleted (`deleted_at` set)
- AND all future cron jobs for all occurrences are unregistered

### Requirement: Listing Recurrence Info

When listing tasks, the system MUST display frequency information for recurring tasks.

#### Scenario: List shows recurrence status

- GIVEN a user with 1 recurring task and 1 one-time task
- WHEN the user requests pending tasks
- THEN the recurring task shows frequency type and next occurrence
- AND the one-time task shows no frequency indicator

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Validation | Description MUST be 1–500 chars after trim. Date MUST be a valid future date. Reminder offsets MUST be positive. |
| NF2 | Scheduler | Cron jobs MUST survive process restart — re-registered from DB on startup. |
| NF3 | Correctness | `tsc --noEmit` MUST pass after all changes. |
| NF4 | Compatibility | All existing one-time task CRUD paths MUST continue working unchanged (regression-free) |
