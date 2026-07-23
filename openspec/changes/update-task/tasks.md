# Tasks: Update Existing Tasks via NL Delta

## Phase 1 — Foundation (DB + Repo + Query)

### 1.1 ✅ Add `deletedAt` column to DB schema + manual migration

- **Description**: Add a `deletedAt: text("deleted_at")` column to the `tasks` Drizzle schema (nullable, no default). Run `ALTER TABLE tasks ADD COLUMN deleted_at TEXT;` manually since there's no migration tooling.
- **Files**:
  - `packages/db-core/src/schema/tasks.ts` — add column definition
- **Dependencies**: None
- **Acceptance criteria**:
  - `deletedAt: text("deleted_at")` exists on the `tasks` table definition
  - `Task` (InferSelectModel) includes `deletedAt: string | null`
  - `NewTask` (InferInsertModel) includes `deletedAt: string | null | undefined`
  - SQL `ALTER TABLE` run against the Turso database

### 1.2 ✅ Add `update()` and `softDelete()` to `IAstralTaskRepository`

- **Description**: Extend the repository interface with two new methods:
  - `update(id: string, data: Partial<NewTask>): Promise<Task>`
  - `softDelete(id: string): Promise<void>`
- **Files**:
  - `src/application/ports/IAstralTaskRepository.ts`
- **Dependencies**: None
- **Acceptance criteria**:
  - Both method signatures present
  - `Partial<NewTask>` imported from `@task-bot/db-core`
  - No existing code broken (interface is implemented by `TursoTaskRepository`)

### 1.3 ✅ Implement `update()` and `softDelete()` in `TursoTaskRepository`

- **Description**: Implement the two new methods. `update()` must JSON-stringify `reminderConfig` and `frequency` before persisting (handling `null` vs `undefined` for frequency). `softDelete()` sets `deletedAt` to `new Date().toISOString()`. Also modify `findByUserId` to add `isNull(tasks.deletedAt)` to the WHERE clause, and modify `findPendingReminders` similarly to exclude soft-deleted tasks.
- **Files**:
  - `src/infrastructure/db/TursoTaskRepository.ts`
- **Dependencies**: 1.1, 1.2
- **Acceptance criteria**:
  - `update()` serializes JSON fields correctly, returns the updated row
  - `softDelete()` sets `deleted_at` timestamp, doesn't throw for non-existent IDs
  - `findByUserId()` excludes rows where `deleted_at IS NOT NULL`
  - `findPendingReminders()` excludes soft-deleted tasks
  - Import `isNull` from `drizzle-orm` if not already imported

### 1.4 ✅ Create `QueryPendingTasks` use case

- **Description**: New use case that wraps `taskRepo.findByUserId(userId)` and returns tasks sorted by datetime ascending. (Soft-delete filtering is now done by the repo so this is just a thin orchestration wrapper.)
- **Files**:
  - `src/application/use-cases/astral/QueryPendingTasks.ts` (new)
- **Dependencies**: 1.3
- **Acceptance criteria**:
  - Class `QueryPendingTasks` with constructor `(taskRepo: IAstralTaskRepository)`
  - `execute(userId: string): Promise<Task[]>` returns tasks sorted by `datetime` (ISO string ascending)
  - Type imports for `IAstralTaskRepository` and `Task`

### 1.5 ✅ Wire new repo changes in main.ts

- **Description**: No new wiring yet for use cases (that's Phase 5), but ensure `TursoTaskRepository` compiles with the new interface methods. Verify `tsc --noEmit` passes after repo changes.
- **Files**: (typecheck only)
- **Dependencies**: 1.3
- **Acceptance criteria**:
  - `tsc --noEmit` passes with Phase 1 changes

## Phase 2 — Merge Logic

> **Note**: The original tasks 2.1-2.3 planned to add `merge()` to `ITimeParser`/`TimeParserService`.
> The implementation instead consolidated ALL merge logic (AI prompt, regex fallback, TaskSchema
> validation, diff generation) into the `UpdateTaskFromNLP` use case (2.4). The use case injects
> both `ITimeParser` (for regex fallback) and an optional AI `chatSync` service (for merge prompt)
> independently, avoiding changes to the existing `TimeParserService` interface.

### 2.1 ✅ Create `UpdateTaskFromNLP` use case with AI merge prompt

- **Description**: New file `src/application/use-cases/astral/UpdateTaskFromNLP.ts`. The use case
  orchestrates the merge pipeline with two paths:
  - **AI merge path**: Builds a merge-specific system prompt with the original task JSON + user delta,
    sends to AI service, parses the JSON response, validates with `TaskSchema.parse()`, and returns
    the merged task with a diff of changed fields.
  - **Regex fallback path**: Uses `TimeParserService.execute(delta, country)` to parse the delta as
    a standalone task, overlays extracted fields (description, datetime, frequency) onto the original,
    validates with `TaskSchema.parse()`, and returns the merged task + diff.
  - Only fields `description`, `datetime`, `frequency`, `reminderConfig` are allowed to change.
    All other fields (`id`, `userId`, `createdAt`, `mediaUrl`, `mediaType`, `scheduledFor`) are
    preserved from the original task.
- **Files**:
  - `src/application/use-cases/astral/UpdateTaskFromNLP.ts` (new)
- **Dependencies**: None (injects `ITimeParser` and optional AI service)
- **Acceptance criteria**:
  - `UpdateTaskFromNLP` class with `execute(originalTask, delta, country?)` method
  - AI merge prompt includes full task JSON + delta + current date/time in user's timezone
  - AI response parsed as JSON (with markdown fence stripping)
  - Invalid/unparseable AI response falls through to regex fallback
  - `tsc --noEmit` passes

### 2.2 ✅ Implement regex-based field overlay fallback

- **Description**: When AI is unavailable or returns invalid JSON, the fallback calls
  `TimeParserService.execute(delta, country)` to re-parse the delta. The parsed fields
  (`description`, `datetime`, `frequency`) are overlaid onto the original task. Only fields
  that were explicitly extracted from the delta are changed — `reminderConfig` stays unchanged.
  Both the `ParsedTask`'s date and time are combined into the ISO datetime string.
- **Files**:
  - `src/application/use-cases/astral/UpdateTaskFromNLP.ts`
- **Dependencies**: 2.1
- **Acceptance criteria**:
  - Parsed delta overlays description, datetime, and frequency onto original
  - `reminderConfig` cannot be extracted via regex and stays unchanged
  - If regex returns null → throws `MergeError` with user-facing message

### 2.3 ✅ Validate merge output against TaskSchema

- **Description**: After merge (AI or regex fallback), the result MUST pass `TaskSchema.parse()`:
  - AI path: If `TaskSchema.parse()` fails → throw error → caught by caller → fall through to regex
  - Regex path: If `TaskSchema.parse()` fails → throw descriptive `MergeError` with validation details
  - Both paths: if validation passes → return `MergeResult` with validated `TaskData`
- **Files**:
  - `src/application/use-cases/astral/UpdateTaskFromNLP.ts`
- **Dependencies**: 2.2
- **Acceptance criteria**:
  - AI merge failure (invalid JSON or TaskSchema rejection) → falls through to regex
  - Regex overlay failure → throws `MergeError`
  - Valid merge → returns `MergeResult`

### 2.4 ✅ Generate diff/preview of changed fields

- **Description**: `computeDiff()` compares original and merged task field by field:
  - Fields checked: `description`, `datetime`, `frequency`, `reminderConfig`
  - Uses `deepEqual()` for proper comparison (handles null, objects via JSON.stringify)
  - Returns `FieldDiff[]` with `{ field, before, after }`
- **Files**:
  - `src/application/use-cases/astral/UpdateTaskFromNLP.ts`
- **Dependencies**: 2.3
- **Acceptance criteria**:
  - Diff only includes fields that actually changed
  - `before` and `after` contain original and new values
  - Deep equality handles nested objects (frequency, reminderConfig)

## Phase 3 — Controller & Menu

### 3.1 ✅ Add menu entry "5️⃣ Editar tarea" in AstralFeature

- **Description**: Add option "5" to `SUBMENU_COMMANDS` mapping to `c.enterEditTaskFlow(s)`. Add text aliases "editar tarea", "modificar tarea", "cambiar tarea" → "5". Update the `rememberAllMenu()` message in `AstralMenuService` to include the new option.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralFeature.ts`
  - `src/interface/whatsapp/features/astral/AstralMenuService.ts`
- **Dependencies**: None (menu text only)
- **Acceptance criteria**:
  - Menu shows `5️⃣ Editar tarea`
  - Pressing "5" calls `enterEditTaskFlow`
  - Typing "editar tarea" or "modificar tarea" resolves to "5"

### 3.2 ✅ Create `enterEditTaskFlow` in AstralController

- **Description**: Registration gate, then load tasks via `QueryPendingTasks.execute(userId)`. If empty, show "No tenés tareas pendientes." and return to menu. If tasks exist, render a numbered list and transition to `astral::waiting_task_edit_select` state with `{ userId, tasks }` in state data.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 1.4, 3.1
- **Acceptance criteria**:
  - Unregistered users redirected to registration
  - Empty task list shows message and returns to menu
  - Tasks rendered with index numbers, state transitions correctly
  - Cancel (0/salir) returns to menu

### 3.3 ✅ Create `handleTaskEditSelect` handler

- **Description**: Parse the user's number selection, validate range against `data.tasks`. Fetch the full task from the repo via `taskRepo.findById(taskId)` (not from cached list — ensures fresh data). Show current task detail (description, datetime, frequency, reminders). Prompt for the NL delta. Set state to `astral::waiting_task_edit_delta` with `{ userId, originalTask }`.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 3.2
- **Acceptance criteria**:
  - Invalid number → error message, stay in same state
  - Valid selection → show task detail + delta prompt, transition state
  - Cancel (0/salir) → return to menu

### 3.4 ✅ Create `handleTaskEditDelta` handler

- **Description**: Receives the NL delta text. Send "🤔 Procesando cambio..." loading message. Call `UpdateTaskFromNLP.execute({ originalTask, delta, country })`. On success → extract diff and format preview message, transition to `astral::waiting_task_edit_confirm` with `{ userId, mergedTask, diff }`. On `MergeError` → show "No entendí el cambio. Podés explicarlo de otra forma?" and stay in same state (with retry counter, max 3 → then return to menu). Handle cancel.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 2.4, 3.3
- **Acceptance criteria**:
  - Valid delta → diff preview shown, state transitions to confirm
  - Invalid delta → rephrase prompt, stays in state (with retry tracking)
  - 3 failed attempts → return to menu
  - Cancel at any point → return to menu

### 3.5 ✅ Create `handleTaskEditConfirm` handler

- **Description**: User confirms ("sí") or cancels ("no"). On "sí":
  1. Verify task still exists via `taskRepo.findById` — if null, show "Tarea no encontrada" and return to menu
  2. Check diff for scheduler-triggering fields: if `diff.datetime || diff.frequency || diff.reminderConfig` → call `scheduler.cancelReminder(taskId)`
  3. Persist via `taskRepo.update(id, mergedFields)` — only pass merged fields, not the full task
  4. If reschedule needed and datetime not in past → call `scheduler.scheduleTaskReminder()` or `scheduler.scheduleRecurringTask()` as appropriate
  5. Show success message and return to menu
  On "no" → show menu.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 3.4
- **Acceptance criteria**:
  - Task persisted, scheduler synced on datetime/frequency/reminderConfig change
  - Past datetime → task saved without scheduling, warning shown
  - Description-only change → no scheduler interaction
  - Soft-deleted task between list and confirm → "Tarea no encontrada"
  - Cancel → no changes, return to menu

### 3.6 ✅ Add edit-flow messages to AstralMenuService

- **Description**: Add the following message builders:
  - `selectTaskToEdit(tasks: TaskListItem[]): string` — numbered task list with description + datetime
  - `promptForTaskDelta(task: TaskData): string` — current task detail + prompt for what to change
  - `editTaskConfirmDiff(diff: TaskDiff, original: TaskData): string` — formatted diff per the design's template (only changed sections shown)
  - `taskEditSuccess(): string` — "✅ Tarea actualizada correctamente"
  - `taskNotFound(): string` — "Tarea no encontrada. Volviendo al menú."
  - `mergeFailed(message?: string): string` — "No entendí el cambio. Podés explicarlo de otra forma?"
  - `pastDateTimeWarning(): string` — "La fecha ya pasó. La tarea se guardó sin recordatorio."
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralMenuService.ts`
- **Dependencies**: None
- **Acceptance criteria**:
  - All messages render correctly with proper Spanish formatting
  - Diff message follows the design template exactly
  - Only changed sections shown in diff message

### 3.7 ✅ Add edit-flow cases to `handleWaiting` switch

- **Description**: Add three new cases to the `handleWaiting` switch statement in `AstralController`:
  - `waiting_task_edit_select` → `this.handleTaskEditSelect(sender, text, stateData)`
  - `waiting_task_edit_delta` → `this.handleTaskEditDelta(sender, text, stateData)`
  - `waiting_task_edit_confirm` → `this.handleTaskEditConfirm(sender, text, stateData)`
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 3.3, 3.4, 3.5
- **Acceptance criteria**:
  - All three states routed to correct handlers
  - Unrecognized states still return false (existing behavior preserved)

## Phase 4 — Scheduler Integration

### 4.1 ✅ Implement scheduler cancel + re-schedule decision matrix

- **Description**: In `handleTaskEditConfirm`, implement the decision matrix:
  - Check which of `datetime`, `frequency`, `reminderConfig` changed via diff
  - If any changed: call `scheduler.cancelReminder(taskId)` BEFORE persisting
  - After persist: if needed, call `scheduler.scheduleTaskReminder()` (one-time) or `scheduler.scheduleRecurringTask()` (recurring)
  - Use the merged `datetime` as Date object and merged `reminderConfig`/`frequency`
  - No changes to `ISchedulerService` or `NodeCronScheduler` needed — they already support these methods
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 3.5
- **Acceptance criteria**:
  - `datetime` change → cancel old, schedule new at new time
  - `frequency` change → cancel old, schedule new with new frequency
  - `reminderConfig` change → cancel old, schedule new with new config
  - Description-only change → skip scheduler entirely (4.2)
  - Frequency removed → recurring cancelled, scheduled as one-time if future (4.3)
  - Past datetime → saved, warning shown, no scheduling

### 4.2 ✅ Handle past-datetime edge case

- **Description**: After merge, check if `merged.datetime` is in the past (compared to now). If yes: persist the task but skip scheduling. Show warning message via `AstralMenuService.taskDateTimePassed()`.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
  - `src/interface/whatsapp/features/astral/AstralMenuService.ts`
- **Dependencies**: 4.1
- **Acceptance criteria**:
  - Past datetime + datetime changed: task saved, no scheduling, warning shown
  - Future datetime: normal scheduling

### 4.3 ✅ Handle description-only change edge case

- **Description**: If the diff only contains `description` changes (no datetime/frequency/reminderConfig), skip all scheduler interactions entirely. Only call `taskRepo.update()`.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 4.1
- **Acceptance criteria**:
  - Description-only update: no cancelReminder, no schedule call
  - Other field changes still trigger scheduler sync

### 4.4 ✅ Handle frequency-removed edge case

- **Description**: If the original task had a frequency and the merged task doesn't: cancel recurring schedule, save task, then if datetime ≥ now schedule as one-time (single reminder cycle), else show past-datetime warning.
- **Files**:
  - `src/interface/whatsapp/features/astral/AstralController.ts`
- **Dependencies**: 4.1
- **Acceptance criteria**:
  - Frequency removed + future datetime: recurring cancelled, one-time scheduled
  - Frequency removed + past datetime: recurring cancelled, saved, past-datetime warning shown

## Phase 5 — Wiring & Verification

### 5.1 ✅ Wire `QueryPendingTasks` and `UpdateTaskFromNLP` in main.ts

- **Description**: Instantiate both new use cases in `App` constructor and pass them to `AstralFeature`:
  ```ts
  const queryPendingTasks = new QueryPendingTasks(taskRepo);
  const updateTaskFromNLP = new UpdateTaskFromNLP(this.timeParser);
  ```
  Add both to `AstralFeature` constructor as new parameters. The controller already has them injected via AstralFeature.
- **Files**:
  - `src/main.ts` — instantiate use cases, pass to AstralFeature
  - `src/interface/whatsapp/features/astral/AstralFeature.ts` — add constructor params, store as fields, pass to controller
  - `src/interface/whatsapp/features/astral/AstralController.ts` — add constructor params, store as fields
- **Dependencies**: 1.4, 2.4
- **Acceptance criteria**:
  - `QueryPendingTasks` instantiated with `taskRepo`
  - `UpdateTaskFromNLP` instantiated with `timeParser`
  - Both passed through AstralFeature → AstralController
  - No TypeScript errors

### 5.2 ✅ `tsc --noEmit` passes

- **Description**: Run `tsc --noEmit` and fix any type errors across all changes.
- **Files**: (typecheck only)
- **Dependencies**: All Phase 1-4 tasks
- **Acceptance criteria**:
  - `tsc --noEmit` exits with code 0
  - No type errors related to new or modified code

### 5.3 ✅ Update change progress in `openspec/changes/update-task/tasks.md`

- **Description**: Mark completed tasks with `[x]` after each is implemented. This file is the source of truth for progress tracking.
- **Files**:
  - `openspec/changes/update-task/tasks.md`
- **Dependencies**: All implementation tasks
- **Acceptance criteria**:
  - Completed tasks marked `[x]`, pending tasks marked `[ ]`
  - File accurately reflects current implementation state
