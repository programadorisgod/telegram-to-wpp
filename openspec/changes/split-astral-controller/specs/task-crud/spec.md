# Delta for Task CRUD

## ADDED Requirements

### Requirement: Domain-Specific Controller Architecture

Task-related handlers MUST be implemented in a dedicated `TaskController` class, separate from other domain controllers (Note, Project, Audio, Registration). The `TaskController` SHALL handle all task creation, listing, editing, confirmation, NLP routing, frequency configuration, and contact search flows.

#### Scenario: TaskController handles task creation flow

- GIVEN a user enters the task flow via "1" or natural language input
- WHEN the user provides task details through the conversation
- THEN the `TaskController` MUST handle the entire flow: parse, confirm, create, schedule
- AND the flow behavior MUST be identical to the previous monolithic controller

#### Scenario: TaskController handles NLP routing

- GIVEN a user sends natural language input like "comprar leche mañana"
- WHEN the input is routed through the state machine
- THEN the `TaskController` MUST process it through the NLP pipeline
- AND the response MUST be identical to the previous behavior

#### Scenario: All existing task contexts are preserved

- GIVEN the state machine has contexts like "astral::waiting_task_raw", "astral::waiting_task_confirm", "astral::waiting_task_edit_select"
- WHEN the controllers are split
- THEN all context strings MUST remain unchanged
- AND the state machine routing MUST work identically

#### Scenario: TaskController receives only task-related dependencies

- GIVEN the `TaskController` is instantiated
- WHEN dependencies are injected
- THEN it MUST receive only: `timeParser`, `createTaskFromNLP`, `queryPendingTasks`, `updateTaskFromNLP`, `taskRepo`, `scheduler`, `fileStorage`, `whatsappService`, `stateMachine`, `menuService`, `registerUser`
- AND it MUST NOT receive note, project, or audio dependencies
