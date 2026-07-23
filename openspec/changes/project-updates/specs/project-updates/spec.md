# Project Updates Specification

## Purpose

Free-text conversational progress logging on projects. Users enter an "update mode" where each message is persisted as a structured update on the selected project, with a history view.

## Requirements

### Requirement: Enter Update Mode

The user MUST be able to select a project from a numbered list and enter conversational update mode.

#### Scenario: Select project and enter update mode

- GIVEN the user has projects "Compras" and "Estudio"
- WHEN they select "Actualizar proyecto" from the Astral submenu
- THEN the system SHOWS a numbered list of projects
- AND prompts "Elegí un proyecto para actualizar (número):"
- WHEN the user replies "1"
- THEN the system enters update mode for "Compras"
- AND responds "Modo actualización — Compras. Mandame los updates que quieras guardar."

#### Scenario: Invalid selection

- GIVEN the user sees a list of 2 projects
- WHEN they reply "5"
- THEN the system SHALL respond "Número inválido. Elegí un número de la lista."

### Requirement: Log Updates

When in update mode, the system MUST save each user message as a `ProjectUpdate` and prompt to continue.

#### Scenario: Save update and prompt for more

- GIVEN the user is in update mode for "Compras"
- WHEN they send "Avancé con la lista del super"
- THEN a `ProjectUpdate` is created with `{ projectId, content: "Avancé con la lista del super", createdAt }`
- AND the system confirms "✅ Guardé el update. ¿Querés agregar otro? (si/no)"

#### Scenario: Loop — add another

- GIVEN the system asked "¿Querés agregar otro? (si/no)"
- WHEN the user replies "si"
- THEN the system stays in update mode for the same project
- AND prompts "Mandame el próximo update:"

#### Scenario: Empty message rejected

- GIVEN the user is in update mode
- WHEN they send a blank or whitespace-only message
- THEN the system SHALL respond "No puedo guardar un update vacío. Mandame el texto o decí 'no' para salir."
- AND remain in update mode

### Requirement: Exit Update Mode

The system MUST exit update mode when the user declines to continue or sends an exit keyword.

#### Scenario: Exit by declining

- GIVEN the system asked "¿Querés agregar otro? (si/no)"
- WHEN the user replies "no"
- THEN the system exits update mode
- AND returns to the Astral submenu

#### Scenario: Exit by keyword

- GIVEN the user is in update mode
- WHEN they send "salir", "menu", or "0"
- THEN the system exits update mode
- AND returns to the Astral submenu

### Requirement: View Update History

The user MUST be able to view the last 5 updates for a project.

#### Scenario: History with updates

- GIVEN a project "Compras" with 10 updates
- WHEN the user selects "Ver historial" for that project
- THEN the system SHALL display the 5 most recent updates with ISO date and content
- AND each entry SHALL format as "📅 2026-06-03 14:30 — Avancé con la lista"

#### Scenario: Empty history

- GIVEN a project with no updates
- WHEN the user views history
- THEN the system SHALL respond "Todavía no hay updates para este proyecto."

### Requirement: No Projects Available

The system MUST handle the absence of projects gracefully.

#### Scenario: User has no projects

- GIVEN the user has zero projects
- WHEN they select "Actualizar proyecto"
- THEN the system SHALL respond "No tenés proyectos. Creá uno primero."

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Storage | Content MUST be saved as-is (no NLP, no structured parsing). |
| NF2 | Input | Empty/whitespace messages MUST be rejected. Any other text SHALL be accepted. |
| NF3 | Performance | History query MUST return within 200ms for <1000 updates. |
