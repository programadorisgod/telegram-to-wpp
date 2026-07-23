# Multi-Schedule Recurring Reminders

## Requirement: Weekly Schedules Array

The `RecurrenceFrequency` value object for `weekly` type MUST support an optional `schedules` array. Each schedule entry defines a subset of days-of-week and a specific time.

### Scenario: Two-schedule weekly task

- GIVEN a user says "recuérdame lunes a viernes a las 16:40 y sábados a las 11:30"
- WHEN parsing the frequency
- THEN the system produces `{type:"weekly", schedules:[{daysOfWeek:[1,2,3,4,5],time:"16:40"},{daysOfWeek:[6],time:"11:30"}]}`

### Scenario: Three-schedule weekly task

- GIVEN a user says "lunes a viernes a las 16:40, sábados a las 11:30 y domingos a las 17:00"
- WHEN parsing the frequency
- THEN the system produces `{type:"weekly", schedules:[{daysOfWeek:[1,2,3,4,5],time:"16:40"},{daysOfWeek:[6],time:"11:30"},{daysOfWeek:[7],time:"17:00"}]}`

### Scenario: Mutual exclusion

- GIVEN a frequency with both `schedules` and `daysOfWeek`
- WHEN validating with Zod
- THEN the system rejects with a conflict error

### Scenario: Backward compatibility

- GIVEN an existing weekly task with `{type:"weekly", daysOfWeek:[1,3,5]}`
- WHEN loading the task
- THEN it works exactly as before (no `schedules` present)

## Requirement: Multi-Schedule Next Occurrence

`calculateNextOccurrence()` MUST find the earliest next fire across all schedule entries when `schedules` is present.

### Scenario: Earliest schedule wins

- GIVEN schedules `[{daysOfWeek:[1,2,3,4,5],time:"16:40"},{daysOfWeek:[6],time:"11:30"}]`
- AND today is Wednesday at 10:00
- WHEN calculating next occurrence
- THEN it returns Wednesday at 16:40 (weekday schedule fires first)

### Scenario: Weekend schedule fires next

- GIVEN the same schedules
- AND today is Friday at 17:00 (after 16:40)
- WHEN calculating next occurrence
- THEN it returns Saturday at 11:30 (weekday schedule passed, weekend is next)

### Scenario: Sunday schedule fires next

- GIVEN the same schedules
- AND today is Saturday at 12:00 (after 11:30)
- WHEN calculating next occurrence
- THEN it returns Monday at 16:40 (weekend passed, next weekday is Monday)

### Scenario: Same day, different schedules

- GIVEN schedules `[{daysOfWeek:[1],time:"09:00"},{daysOfWeek:[1,3],time:"14:00"}]`
- AND today is Monday at 08:00
- WHEN calculating next occurrence
- THEN it returns Monday at 09:00 (earliest time on the earliest matching day)

## Requirement: Multi-Schedule Event Insertion

`insertEventsForTask()` MUST generate reminder_event rows for each schedule entry's next occurrence, picking the earliest.

### Scenario: Single event per occurrence

- GIVEN a multi-schedule weekly task
- WHEN inserting events
- THEN only ONE reminder_event row is created for the earliest next occurrence
- AND the event's `fireAt` matches the correct schedule's time

### Scenario: Subsequent occurrence uses correct schedule

- GIVEN the earliest occurrence fired (e.g., Friday 16:40)
- WHEN calculating the next occurrence after that
- THEN it finds the next schedule entry that fires after the last event (e.g., Saturday 11:30)

## Requirement: AI Multi-Schedule Parsing

The AI system prompt MUST include examples for multi-schedule weekly frequency output.

### Scenario: AI parses two-schedule pattern

- GIVEN the input "recuérdame de lunes a viernes a las 4:40 y los sábados a las 11:30"
- WHEN the AI parses it
- THEN it returns frequency with `schedules` array containing two entries

### Scenario: AI parses three-schedule pattern

- GIVEN the input "lunes a viernes a las 16:40, sábados a las 11:30 y domingos a las 5pm"
- WHEN the AI parses it
- THEN it returns frequency with `schedules` array containing three entries

## Requirement: Regex Safety Net

`extractFrequency()` MUST detect common multi-schedule patterns as a fallback when AI fails.

### Scenario: Regex detects weekday + weekend pattern

- GIVEN the input "todos los lunes a viernes a las 16:40 y sábados a las 11:30"
- WHEN `extractFrequency()` runs
- THEN it returns `{type:"weekly", schedules:[{daysOfWeek:[1,2,3,4,5],time:"16:40"},{daysOfWeek:[6],time:"11:30"}]}`
