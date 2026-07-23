# Task NLP Specification

## Purpose

Define the natural language parsing behavior that extracts structured task data (date, time, description) from free-text Spanish messages using heuristics — no external AI.

## Requirements

### Requirement: Date Extraction

The system MUST extract date references from Spanish text, supporting relative terms, named days, and explicit dates.

#### Scenario: Relative date "hoy" / "mañana"

- GIVEN input "mañana tengo que comprar leche"
- WHEN the parser runs
- THEN it returns `{ date: tomorrow, time: null, description: "comprar leche" }`

#### Scenario: Relative date "pasado mañana"

- GIVEN input "pasado mañana reunión a las 3pm"
- WHEN the parser runs
- THEN it returns `{ date: dayAfterTomorrow, time: "15:00", description: "reunión" }`

#### Scenario: Named day "el martes"

- GIVEN input "el martes debo hacer X a las 5pm"
- WHEN the parser runs
- THEN it returns the next upcoming Tuesday as the date

#### Scenario: Explicit date "20 de diciembre"

- GIVEN input "comprar regalos el 20 de diciembre"
- WHEN the parser runs
- THEN it returns December 20 of the current or next year (whichever is future)

#### Scenario: No date found

- GIVEN input "comprar leche" with no date reference
- WHEN the parser runs
- THEN it returns today as the default date

### Requirement: Time Extraction

The system MUST extract time references in 12h and 24h formats.

#### Scenario: 12h format "a las 5pm"

- GIVEN input "reunión a las 5pm"
- WHEN the parser runs
- THEN it returns `{ time: "17:00" }`

#### Scenario: 24h format "a las 15:00"

- GIVEN input "reunión a las 15:00"
- WHEN the parser runs
- THEN it returns `{ time: "15:00" }`

#### Scenario: No time found

- GIVEN input "hacer algo mañana" with no time
- WHEN the parser runs
- THEN it returns `{ time: null }` — time is optional

### Requirement: Description Extraction

The system MUST strip recognized date/time tokens from the input and return the remainder as the description.

#### Scenario: Clean description

- GIVEN input "el martes debo hacer X a las 5pm"
- WHEN the parser runs
- THEN description is "debo hacer X" (date/time tokens stripped)

#### Scenario: Description only (no date/time)

- GIVEN input "comprar leche" with no temporal tokens
- WHEN the parser runs
- THEN description is "comprar leche"

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Performance | Parser MUST complete in <10ms for any input under 200 chars. |
| NF2 | Locale | Parser targets Spanish only. Non-Spanish input SHOULD fall back to today + full input as description. |
| NF3 | Determinism | Same input MUST always produce the same parse result (pure function). |

## Edge Cases

| Case | Behavior |
|------|----------|
| Input with multiple dates | Parser SHOULD use the first recognized date reference |
| "el lunes" when today is Monday | Parser returns next Monday (not today) |
| Ambiguous "3" without am/pm | Parser returns `"03:00"` — treated as 24h |
