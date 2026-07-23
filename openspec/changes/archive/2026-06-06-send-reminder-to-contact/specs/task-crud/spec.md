# Delta for task-crud

_This is a delta spec for the `send-reminder-to-contact` change._

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Task Creation

The system MUST create tasks with description, scheduled date/time, a combinable reminder config, and an OPTIONAL `scheduledFor` recipient ID. When `scheduledFor` is omitted or NULL, the reminder routes to the task creator. Reminder options are: 1 day before, 3 hours before, 1 hour before, at exact time — any combination.
(Previously: Task creation without recipient field — reminders always routed to creator)

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

## REMOVED Requirements

None.
