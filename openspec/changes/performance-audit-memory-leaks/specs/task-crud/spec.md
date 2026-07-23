# Delta for Task CRUD

## ADDED Requirements

### Requirement: Domain-Specific Controller Architecture

Task-related handlers MUST be implemented in a dedicated TaskController, separate from other domain controllers (Note, Project, Audio, Registration). The TaskController SHALL handle all task creation, listing, editing, confirmation, and NLP routing flows.

#### Scenario: TaskController handles task creation flow

- GIVEN a user enters the task flow via "1" or natural language
- WHEN the user provides task details
- THEN the TaskController MUST handle the entire flow: parse, confirm, create, schedule
- AND the flow MUST be identical to the previous monolithic controller behavior

#### Scenario: TaskController handles NLP routing

- GIVEN a user sends natural language input like "comprar leche mañana"
- WHEN the input is routed
- THEN the TaskController MUST process it through the NLP pipeline
- AND the response MUST be identical to the previous behavior

#### Scenario: All existing task contexts are preserved

- GIVEN the state machine has contexts like "astral::waiting_task_raw", "astral::waiting_task_confirm", "astral::waiting_task_edit_select"
- WHEN the controllers are split
- THEN all context strings MUST remain unchanged
- AND the state machine routing MUST work identically
