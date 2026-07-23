# Delta for task-nlp

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Description Extraction

The system MUST strip recognized date/time AND frequency tokens from the input and return the remainder as the description.
(Previously: only date/time tokens were stripped)

#### Scenario: Clean description with frequency tokens removed

- GIVEN input "todos los días a las 5pm pasear al perro"
- WHEN the parser runs
- THEN description is "pasear al perro" (all frequency + time tokens stripped)

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Determinism | Regex-based frequency detection MUST be deterministic (pure function). AI-based detection is non-deterministic by nature. |
| NF2 | Compatibility | Parser MUST return valid ParsedTask for inputs WITHOUT frequency—backward compatible with existing callers |
