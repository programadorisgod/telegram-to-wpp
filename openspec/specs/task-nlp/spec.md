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

### Requirement: Frequency Extraction

The system MUST detect frequency patterns from Spanish text and include an OPTIONAL `frequency` field in the parsed result. Detection SHOULD combine AI-based and regex-based fallback strategies.

Supported patterns:

| Input Pattern | Output |
|---------------|--------|
| "3 veces al día", "cada 6 horas" | `{type:"daily", timesPerDay:N}` |
| "todos los días", "cada día", "diariamente" | `{type:"daily"}` |
| "cada 2 días", "cada 3 días" | `{type:"interval", interval:N}` |
| "todos los lunes", "lunes y miércoles", "cada semana" | `{type:"weekly", daysOfWeek:[N,...]}` |
| "todos los 30", "cada mes el día 15" | `{type:"monthly", dayOfMonth:N}` |
| "durante esta semana", "por un mes", "hasta el viernes" | Sets `endDate` |

#### Scenario: "3 veces al día"

- GIVEN input "recordame 3 veces al día tomar agua"
- WHEN the parser runs
- THEN the result includes `frequency: {type:"daily", timesPerDay:3}`

#### Scenario: "todos los lunes y miércoles"

- GIVEN input "todos los lunes y miércoles reunión a las 10am"
- WHEN the parser runs
- THEN description is "reunión", time is "10:00", and `frequency: {type:"weekly", daysOfWeek:[1,3]}`

#### Scenario: "cada 3 días"

- GIVEN input "cada 3 días regar las plantas"
- WHEN the parser runs
- THEN `frequency: {type:"interval", interval:3}`

#### Scenario: "todos los 30"

- GIVEN input "todos los 30 pagar la tarjeta"
- WHEN the parser runs
- THEN `frequency: {type:"monthly", dayOfMonth:30}`

#### Scenario: "durante esta semana"

- GIVEN input "todos los días durante esta semana"
- WHEN the parser runs
- THEN frequency includes `endDate` set to end of current week

#### Scenario: No frequency in text

- GIVEN input "comprar leche mañana" with no frequency indicator
- WHEN the parser runs
- THEN `frequency` is null or absent from the result

#### Scenario: Frequency with explicit time

- GIVEN input "todos los días a las 5pm pasear al perro"
- WHEN the parser runs
- THEN description is "pasear al perro", time is "17:00", and `frequency: {type:"daily"}`

#### Error: Conflicting frequency patterns

- GIVEN input "todos los días cada 2 horas" (conflicting daily patterns)
- WHEN the parser runs
- THEN it SHOULD prioritize the most specific pattern (timesPerDay > simple daily)

### Requirement: Description Extraction

The system MUST strip recognized date/time AND frequency tokens from the input and return the remainder as the description.
(Previously: only date/time tokens were stripped)

#### Scenario: Clean description

- GIVEN input "el martes debo hacer X a las 5pm"
- WHEN the parser runs
- THEN description is "debo hacer X" (date/time tokens stripped)

#### Scenario: Clean description with frequency tokens removed

- GIVEN input "todos los días a las 5pm pasear al perro"
- WHEN the parser runs
- THEN description is "pasear al perro" (all frequency + time tokens stripped)

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
| NF4 | Determinism | Regex-based frequency detection MUST be deterministic (pure function). AI-based detection is non-deterministic by nature. |
| NF5 | Compatibility | Parser MUST return valid ParsedTask for inputs WITHOUT frequency — backward compatible with existing callers |

## Edge Cases

| Case | Behavior |
|------|----------|
| Input with multiple dates | Parser SHOULD use the first recognized date reference |
| "el lunes" when today is Monday | Parser returns next Monday (not today) |
| Ambiguous "3" without am/pm | Parser returns `"03:00"` — treated as 24h |
