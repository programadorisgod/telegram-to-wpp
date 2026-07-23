# Recurring Reminders Specification

## Purpose

Define the recurring/periodic reminder scheduling system. Recurring tasks repeat on a configurable schedule (daily, interval, weekly, monthly) and coexist with existing one-time tasks without regressions.

## Requirements

### Requirement: RecurrenceFrequency Value Object

The system MUST define a `RecurrenceFrequency` value object with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"daily"\|"interval"\|"weekly"\|"monthly"` | YES | Frequency mode |
| `interval` | `number` | No | Every N units (days for daily/interval, weeks for weekly) |
| `timesPerDay` | `number` | No | Multiples per day (3 = 3 times) |
| `daysOfWeek` | `number[]` | No | 1=Monday..7=Sunday |
| `dayOfMonth` | `number` | No | 1-31 (clamped to last valid day) |
| `endDate` | `string\|null` | No | ISO date; null = unbounded |
| `endAfterOccurrences` | `number` | No | Stop after N total occurrences |

#### Scenario: Valid daily with timesPerDay

- GIVEN `{type:"daily", timesPerDay:3}`
- WHEN creating a RecurrenceFrequency
- THEN it validates successfully

#### Scenario: Monthly day clamp for short months

- GIVEN `{type:"monthly", dayOfMonth:31}` on January 31
- WHEN February is reached
- THEN the occurrence fires on Feb 28 (or 29 in leap year)

#### Scenario: Null endDate means indefinite

- GIVEN `{type:"weekly", endDate:null}`
- THEN recurrence repeats until manually cancelled

#### Scenario: Invalid frequency rejected

- GIVEN `{type:"daily", dayOfMonth:15}` (conflicting fields)
- WHEN validating
- THEN the system SHALL reject with a validation error

### Requirement: Scheduling Behavior

First occurrence SHALL start at `task.datetime`. Each subsequent occurrence SHALL be calculated from the previous. For `timesPerDay > 1`, occurrences SHALL be evenly spaced from the start time across 24h. Only `oneHourBefore` and `exactTime` offsets SHALL be available for recurring tasks.

#### Scenario: Times-per-day spacing

- GIVEN a task at 09:00 with `timesPerDay:3`
- WHEN scheduling daily occurrences
- THEN they fire at 09:00, 17:00, and 01:00 (next day)

#### Scenario: Weekly on specific days

- GIVEN `{type:"weekly", daysOfWeek:[1,3,5]}` starting Monday
- WHEN scheduling
- THEN occurrences fire every Monday, Wednesday, Friday

#### Scenario: One-day offset rejected for recurring

- GIVEN a recurring task with `reminderConfig:["1d"]`
- WHEN validating
- THEN the system SHALL return a validation error

### Requirement: Restart Recovery

On restart, the scheduler MUST skip past occurrences and schedule the next future one.

#### Scenario: Skip past on restart

- GIVEN a daily task at 08:00 that last fired yesterday
- WHEN system restarts at 14:00 today
- THEN today's 08:00 is skipped
- AND tomorrow's 08:00 is scheduled

### Requirement: Database Migration

The tasks table MUST gain a nullable `frequency` TEXT column storing JSON-serialized RecurrenceFrequency. One-time tasks SHALL have `frequency = NULL`. The migration MUST be generated via `drizzle-kit generate`.

#### Scenario: Migration produces valid SQL

- GIVEN Drizzle schema updated with `frequency` TEXT column
- WHEN running `drizzle-kit generate`
- THEN a valid SQLite migration file is created adding the column

#### Scenario: One-time task unaffected

- GIVEN an existing one-time task with no frequency
- WHEN reading from DB
- THEN `frequency` is NULL

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Correctness | Frequency JSON MUST round-trip through DB serialize/deserialize without data loss |
| NF2 | Migration | `drizzle-kit generate` MUST produce a valid SQLite ALTER TABLE migration |
| NF3 | Compatibility | ts-node/esbuild SHALL support optional chaining on null frequency without guard checks |
