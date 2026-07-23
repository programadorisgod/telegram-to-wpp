# Parallel Reminders Specification

## Purpose

Speed up the boot-time re-registration of pending reminders by processing tasks in parallel instead of sequentially.

## Requirements

### Requirement: Parallel Re-Registration with Chunking

The ReminderScheduler.reRegisterPendingReminders() MUST process tasks in parallel using Promise.allSettled with configurable chunk sizes.

#### Scenario: Tasks are processed in chunks

- GIVEN 100 pending tasks exist in the database
- GIVEN REMINDER_REGISTRATION_CHUNK_SIZE=10
- WHEN reRegisterPendingReminders is called
- THEN tasks MUST be processed in chunks of 10
- AND each chunk MUST use Promise.allSettled for parallel execution
- AND the next chunk MUST start after the previous one completes

#### Scenario: Failed tasks do not block other tasks

- GIVEN 10 tasks are being re-registered in a chunk
- WHEN 2 of them fail (invalid config, DB error)
- THEN the remaining 8 MUST still be registered successfully
- AND the 2 failures MUST be logged individually

#### Scenario: Progress is logged during re-registration

- GIVEN 50 tasks need to be re-registered
- WHEN the process is running
- THEN progress MUST be logged: "Re-registered X/50 tasks (Y chunks complete)"

### Requirement: Chunk Size Is Configurable

The chunk size for parallel re-registration MUST be configurable via environment variable.

#### Scenario: Default chunk size is 10

- GIVEN no REMINDER_REGISTRATION_CHUNK_SIZE is configured
- WHEN re-registration runs
- THEN chunks of 10 tasks MUST be processed in parallel

#### Scenario: Custom chunk size is respected

- GIVEN REMINDER_REGISTRATION_CHUNK_SIZE=25 is set
- WHEN re-registration runs
- THEN chunks of 25 tasks MUST be processed in parallel
