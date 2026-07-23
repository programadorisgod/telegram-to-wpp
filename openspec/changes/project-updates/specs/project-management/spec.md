# Delta for Project Management

## ADDED Requirements

### Requirement: Project Selection for Update Mode

When the user initiates the "Actualizar proyecto" flow, the system SHALL present projects as a numbered list and accept the number as a selection to enter update mode.

#### Scenario: Select project from numbered list

- GIVEN a user with 3 projects "A", "B", "C" ordered by priority
- WHEN the "Actualizar proyecto" flow is activated
- THEN the system SHALL display "1. A\n2. B\n3. C"
- WHEN the user replies "2"
- THEN the system resolves the selection to project "B"
- AND enters update mode for that project
