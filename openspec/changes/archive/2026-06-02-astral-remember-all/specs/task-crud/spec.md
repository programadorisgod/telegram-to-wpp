# Task CRUD Specification

## Purpose

Define task creation, reading, update, and deletion with combinable reminder configuration. Tasks are owned by a user (chatId) and optionally belong to a project.

## Requirements

### Requirement: Task Creation

The system MUST create tasks with description, scheduled date/time, and a combinable reminder config. Reminder options are: 1 day before, 3 hours before, 1 hour before, at exact time — any combination.

#### Scenario: Create with multiple reminders

- GIVEN a confirmed NLP-parsed task and reminder config `{ reminders: ["1d", "1h"] }`
- WHEN the system persists the task
- THEN a task record is created with `reminderConfig: ["1d", "1h"]`
- AND the scheduler registers two cron jobs for that task

#### Scenario: Create with exact-time reminder only

- GIVEN reminder config `{ reminders: ["exact"] }`
- WHEN the system persists the task
- THEN a single reminder fires at the task's scheduled time

#### Scenario: No reminders selected

- GIVEN reminder config `{ reminders: [] }`
- WHEN the system persists the task
- THEN the task is saved with no scheduled reminders (silent task)

### Requirement: Reminder Combinability

The four reminder options (`"1d"`, `"3h"`, `"1h"`, `"exact"`) MUST be combinable in any subset. The `"exact"` option SHALL be mutually compatible with any combination of the other three.

#### Scenario: All four combined

- GIVEN a task with `reminderConfig: ["1d", "3h", "1h", "exact"]`
- WHEN the task is saved
- THEN four cron jobs are registered at the appropriate offsets

### Requirement: Task Retrieval

The system MUST support listing all tasks for a user, optionally filtered by status (pending/completed).

#### Scenario: List pending tasks

- GIVEN a user with 5 tasks (3 pending, 2 completed)
- WHEN the user requests pending tasks
- THEN the system returns only the 3 pending tasks, ordered by scheduled date ascending

### Requirement: Task Update

The system MUST support updating task description, date/time, and reminder config. Updating date/time SHALL re-register all reminder cron jobs.

#### Scenario: Reschedule with reminder re-registration

- GIVEN a task with existing reminders
- WHEN the user updates the scheduled date
- THEN old cron jobs are removed and new ones are registered at the updated offsets

### Requirement: Task Deletion

The system MUST support soft-deleting a task (marked as `deleted_at` set). Deleted tasks SHALL NOT appear in listings.

#### Scenario: Soft delete
- GIVEN an existing task
- WHEN the user confirms deletion
- THEN `deleted_at` is set to current timestamp
- AND all associated cron jobs are unregistered
- AND the task does not appear in pending/completed listings

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Validation | Description MUST be 1–500 chars after trim. Date MUST be a valid future date. Reminder offsets MUST be positive. |
| NF2 | Scheduler | Cron jobs MUST survive process restart — re-registered from DB on startup. |
| NF3 | Correctness | `tsc --noEmit` MUST pass after all changes. |
