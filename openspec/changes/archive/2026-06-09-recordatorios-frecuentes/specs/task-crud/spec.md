# Delta for task-crud

## ADDED Requirements

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

### Requirement: Frequency Update

The system MUST support updating the `frequency` field on existing tasks. Setting `frequency` to NULL SHALL convert a recurring task to one-time (future occurrences cancelled). Changing frequency SHALL recalculate all upcoming occurrences.

#### Scenario: Remove frequency converts to one-time

- GIVEN an existing daily recurring task
- WHEN user updates `frequency` to NULL
- THEN all future recurring occurrences are cancelled
- AND the task behaves as a one-time task

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

## MODIFIED Requirements

### Requirement: Task Retrieval

The system MUST support listing all tasks for a user, optionally filtered by status (pending/completed). Recurring tasks SHALL appear once in the listing, showing the next pending occurrence.
(Previously: no recurrence concept — tasks appeared as one-shot entries)

#### Scenario: List pending tasks (updated)

- GIVEN a user with 5 tasks (3 pending of which 1 is recurring, 2 completed)
- WHEN the user requests pending tasks
- THEN the system returns 3 entries, ordered by next-occurrence date ascending
- AND the recurring task shows its frequency info inline

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Compatibility | All existing one-time task CRUD paths MUST continue working unchanged (regression-free) |
