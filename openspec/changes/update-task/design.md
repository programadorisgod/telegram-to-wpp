# Design: Update Existing Tasks via NL Delta

## Technical Approach

Reuse the existing AI + regex fallback pipeline (`TimeParserService`) for merging, not parsing. A new `UpdateTaskFromNLP` use case orchestrates: original `Task` + NL delta → LLM merge prompt (full Task JSON in, merged JSON out) → Zod validation → fallback → diff → confirm → persist + scheduler re-sync. Controller state machine follows the `startUpdateNote` pattern (select → input → confirm → execute).

## Architecture Decisions

### Decision: AI Merge Prompt over Field-Level Extraction

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Send full task JSON + delta, get merged JSON back | One AI call. Must guard against hallucination. | ✅ **Chosen** — lowest complexity, matches existing NLP pattern |
| Regex extraction per field, then overwrite | No AI dependency. Fragile — can't handle "mover a las 3 y pasarlo a semanal" | ❌ Rejected — can't compose across fields |
| Two-pass: AI merge → regex fallback on field extraction | Covers both. More code. | ✅ **Chosen** — same pattern as `TimeParserService` |

**Rationale**: Reuse proven `TimeParserService` architecture. The prompt changes only slightly — input is full task JSON + delta instead of raw text, output is merged task JSON instead of `ParsedTask`. Same Zod validation, same fallback chain.

### Decision: Soft Delete over Hard Delete

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| Soft delete (`deletedAt` column) | Reversible. Aligns with existing main spec. | ✅ **Chosen** |
| Hard delete (DELETE FROM) | Irreversible. Cleaner schema. | ❌ Rejected — spec mandates soft delete |
| Archive table | Auditable. More schema complexity. | ❌ Out of scope |

**Rationale**: Main spec already defines soft-delete semantics. Skip in `findByUserId`, `findPendingReminders`.

### Decision: Scheduler changes tracked by field diff

The `UpdateTaskFromNLP` returns a diff object indicating which fields changed. The controller decides scheduler action based on diff, not on every save (only `datetime`, `frequency`, `reminderConfig` changes trigger cancel+reschedule).

## Data Flow

```
User picks "5" → enterEditTaskFlow(sender)
  │
  ├─ QueryPendingTasks.execute(userId) → Task[]
  ├─ Show numbered list → state: waiting_task_edit_select
  │
  ├─ User picks number → fetch Task from DB
  ├─ Show current task detail → state: waiting_task_edit_delta
  │
  ├─ User sends NL delta (e.g. "mover a las 3pm")
  │  └─ UpdateTaskFromNLP.execute(originalTask, delta)
  │       ├─ AI: system prompt + task JSON + delta → merged JSON
  │       ├─ TaskSchema.parse(merged) → valid?
  │       │   ├─ YES → return { merged, diff }
  │       │   └─ NO  → regex fallback (field extraction → overlay)
  │       │       ├─ valid? → return { merged, diff }
  │       │       └─ invalid? → throw → controller asks to rephrase
  │       └─ return { mergedTask, diff }
  │
  ├─ Show diff message → state: waiting_task_edit_confirm
  │
  ├─ User confirms ("sí")
  │  └─ if (diff.datetime || diff.frequency || diff.reminderConfig)
  │       scheduler.cancelReminder(taskId)
  │     repo.update(id, mergedData)
  │     if (needsReschedule)
  │       scheduleTaskReminder() or scheduleRecurringTask()
  │     show success → menu
  │
  └─ User cancels ("no")
       └─ show menu
```

## State Machine — Controller Flow

### States

| Context Key | Entry | Data Shape |
|-------------|-------|------------|
| `astral::waiting_task_edit_select` | User sees task list, picks number | `{ userId, tasks: Task[] }` |
| `astral::waiting_task_edit_delta` | User sends NL delta | `{ userId, originalTask: Task }` |
| `astral::waiting_task_edit_confirm` | User sees diff, confirms/cancels | `{ userId, mergedTask, diff }` |

### Transitions

```
astral::menu ──(option 5)──→ waiting_task_edit_select
waiting_task_edit_select ──(pick #)──→ waiting_task_edit_delta
waiting_task_edit_select ──(cancel)──→ astral::menu
waiting_task_edit_delta ──(valid delta)──→ waiting_task_edit_confirm
waiting_task_edit_delta ──(invalid, max retries)──→ astral::menu
waiting_task_edit_confirm ──("sí")──→ astral::menu (after persist)
waiting_task_edit_confirm ──("no")──→ astral::menu
```

### Integration into `handleWaiting`

Add cases to the existing `switch` in `AstralController.handleWaiting()`:

```ts
case "waiting_task_edit_select":
  return this.handleTaskEditSelect(sender, text, stateData);
case "waiting_task_edit_delta":
  return this.handleTaskEditDelta(sender, text, stateData);
case "waiting_task_edit_confirm":
  return this.handleTaskEditConfirm(sender, text, stateData);
```

### Guards

- **Not found**: If task is soft-deleted between list render and confirm → `repo.findById` returns null → show "Tarea no encontrada" → return to menu
- **Invalid delta**: If AI + fallback both fail → "No entendí el cambio. Podés reescribirlo." → stay in `waiting_task_edit_delta`
- **Cancel at any step**: "0", "salir", "cancelar" → return to `astral::menu`

## UpdateTaskFromNLP Use Case

### Input

```ts
interface UpdateTaskFromNLPDTO {
  originalTask: TaskData;  // Full task from DB
  delta: string;           // User's NL change
  country?: string;        // For timezone context
}
```

### Output

```ts
interface MergeResult {
  merged: TaskData;        // Validated via TaskSchema
  diff: TaskDiff;          // What changed
}

interface TaskDiff {
  description?: { from: string; to: string };
  datetime?: { from: string; to: string };
  frequency?: { from: RecurrenceFrequency | null; to: RecurrenceFrequency | null };
  reminderConfig?: { from: ReminderConfig; to: ReminderConfig };
}
```

### AI Prompt Template

```
Eres un asistente que MODIFICA tareas según el cambio que pide el usuario en lenguaje natural.

TAREA ORIGINAL (JSON):
{JSON.stringify(originalTask)}

CAMBIO SOLICITADO: "{delta}"

Reglas:
1. Respondé SOLO con JSON válido, sin markdown, sin explicación.
2. Mantené TODOS los campos que el usuario NO mencione exactamente como están.
3. Si el usuario cambia fecha/hora, actualizá "datetime" en ISO 8601.
4. Si el usuario cambia la descripción, actualizá "description".
5. Si el usuario pide que se repita, actualizá "frequency".
6. Si el usuario saca la repetición, poné "frequency": null.
7. Si el usuario cambia recordatorios, actualizá "reminderConfig".
8. NO inventes campos que no están en la tarea original ni en el cambio.
9. La fecha actual (para calcular fechas relativas) es: {currentDate} en {timezone}
10. Formato exacto:
    {"id": "uuid", "userId": "...", "description": "...", "datetime": "ISO",
     "reminderConfig": {"oneDayBefore": bool, "threeHoursBefore": bool, "oneHourBefore": bool, "exactTime": bool},
     "frequency": null | {...}, "createdAt": "ISO"}
```

### Fallback Strategy

Same chain as `TimeParserService`:

1. **AI call** → attempt merge with above prompt
2. **parseAIResponse** → JSON parse + validate `description`, `datetime` present
3. **TaskSchema.safeParse(merged)** → Zod validate the full merged object
4. If AI ROI (raw response) is null or invalid JSON → **regex fallback**
5. Regex fallback: use `ParseNaturalLanguage.execute(delta)` to extract new description/time/freq, then overlay onto original task fields
6. If regex also fails → throw `MergeError` → controller asks user to rephrase

### Validation

Post-merge, apply `TaskSchema.refine()` constraints:
- Recurring tasks MUST NOT use `oneDayBefore`/`threeHoursBefore`
- `description` 1-500 chars
- `datetime` valid ISO
- Frequency fields consistent per type

## Scheduler Integration

### Decision Matrix

Trigger `cancelReminder(taskId)` + reschedule when:

| Changed Fields | Cancel Old | Schedule New |
|---|---|---|
| `datetime` only | YES | YES |
| `frequency` only | YES | YES |
| `reminderConfig` only | YES | YES |
| `datetime` + `frequency` | YES | YES |
| `description` only | NO | NO |
| User cancels | NO | NO |

### Edge Cases

| Edge | Behavior |
|------|----------|
| `datetime` moved to past | Don't schedule. Show warning: "La fecha ya pasó. La tarea se guardó sin recordatorio." |
| `frequency` removed (→null) | Cancel recurring schedule. Save as one-time. |
| `frequency` added | Cancel existing one-time schedule. Register recurring. |
| Only `description` changed | No scheduler interaction at all. |
| Task not found on confirm | Show error, return to menu, don't change scheduler. |

## Repository Changes

### `IAstralTaskRepository` — New Methods

```ts
update(id: string, data: Partial<NewTask>): Promise<Task>;
softDelete(id: string): Promise<void>;
```

### Interaction with Existing Methods

- `save`: unchanged — used for new tasks only
- `findByUserId(userId)`: must skip `deletedAt IS NOT NULL` — **modify** existing query
- `findPendingReminders()`: must skip soft-deleted tasks — **modify** existing query
- `findById`: unchanged (needed for guard check — returns null if not found regardless of `deletedAt`? Actually, it should probably still find it to show "already deleted" vs "not found" — but for now, leave it finding everything)

### TursoTaskRepository Implementation

```ts
async update(id: string, data: Partial<NewTask>): Promise<Task> {
  const values = {
    ...data,
    reminderConfig: typeof data.reminderConfig === "string"
      ? data.reminderConfig
      : data.reminderConfig ? JSON.stringify(data.reminderConfig) : undefined,
    frequency: typeof data.frequency === "string"
      ? data.frequency
      : data.frequency ? JSON.stringify(data.frequency) : data.frequency === null ? null : undefined,
  };
  const result = await this.db
    .update(tasks)
    .set(values)
    .where(eq(tasks.id, id))
    .returning();
  return result[0];
}

async softDelete(id: string): Promise<void> {
  await this.db
    .update(tasks)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(tasks.id, id));
}
```

### DB Schema Change (`packages/db-core/src/schema/tasks.ts`)

Add column:
```ts
deletedAt: text("deleted_at"),
```

No migration tooling currently — manual `ALTER TABLE tasks ADD COLUMN deleted_at TEXT;`.

## QueryPendingTasks Use Case

### Input/Output

```ts
class QueryPendingTasks {
  constructor(private taskRepo: IAstralTaskRepository) {}
  
  async execute(userId: string): Promise<Task[]> {
    const all = await this.taskRepo.findByUserId(userId);
    return all
      .filter(t => !t.deletedAt)              // not soft-deleted
      .sort((a, b) => a.datetime.localeCompare(b.datetime)); // ASC by datetime
  }
}
```

Already exists in codebase but without soft-delete filtering. **Modify** `TursoTaskRepository.findByUserId` to add `isNull(tasks.deletedAt)` to the WHERE clause.

## Diff / Preview Format

The diff message shown in WhatsApp:

```
📝 *Cambios a la tarea:*

📋 Descripción:
  Antes: "comprar leche"
  Después: "comprar leche descremada"

⏰ Fecha/Hora:
  Antes: "martes, 10 de junio a las 10:00"
  Después: "martes, 10 de junio a las 15:00"

🔄 Frecuencia: sin cambios
⏱ Recordatorios: sin cambios

¿Está bien? *Sí* para confirmar, *No* para cancelar.
```

Render only sections that actually changed. Use `TaskDiff` to decide visibility. Menu service method: `editTaskConfirmDiff(diff: TaskDiff, original: TaskData): string`.

## Error Handling

| Failure Point | Behavior |
|---|---|
| AI merge → invalid JSON | Log warning. Attempt regex fallback. |
| AI merge → valid JSON, fails TaskSchema | Log. Attempt regex fallback. |
| AI + regex both fail | Ask user to rephrase: "No entendí el cambio. Podés explicarlo de otra forma?" |
| AI unreachable (MidAI down) | Skip AI, go directly to regex fallback. Notify user: "Usando modo sin conexión." |
| DB update fails | Show error. Don't touch scheduler. Task remains in original state. |
| Task soft-deleted between list and confirm | "Tarea no encontrada." Return to menu. |

## File Change Plan

### Modified Files (9)

| File | What changes |
|------|-------------|
| `packages/db-core/src/schema/tasks.ts` | Add `deletedAt: text("deleted_at")` column |
| `src/application/ports/IAstralTaskRepository.ts` | Add `update(id, data): Promise<Task>` and `softDelete(id): Promise<void>` |
| `src/infrastructure/db/TursoTaskRepository.ts` | Implement `update`, `softDelete`. Modify `findByUserId` + `findPendingReminders` to filter out soft-deleted. |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Add `startEditTaskFlow`, `handleTaskEditSelect`, `handleTaskEditDelta`, `handleTaskEditConfirm`. Add cases in `handleWaiting`. Inject `UpdateTaskFromNLP`, `QueryPendingTasks`. |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Add `selectTaskToEdit()`, `promptForTaskDelta()`, `editTaskConfirmDiff()`, `taskEditSuccess()`, `taskNotFound()` |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Add menu entry for "5" → edit task. Update `SUBMENU_COMMANDS`, `SUBMENU_TEXT_ALIASES`. Pass new dependencies in constructor. |
| `src/application/use-cases/astral/QueryPendingTasks.ts` | Verify already exists, ensure it filters soft-deleted |
| `src/domain/entities/astral/Task.ts` | No change needed (`TaskSchema` already validates all fields) |
| `openspec/specs/task-crud/spec.md` | Update after archive (final step) |

### New Files (2)

| File | What it does |
|------|-------------|
| `src/application/use-cases/astral/UpdateTaskFromNLP.ts` | Merge orchestrator — AI prompt → parse → validate → fallback → return merged + diff |
| `src/application/ports/IAiMergeService.ts` | Interface for the merge AI call (optional — may inline into `TimeParserService` or create separate class) |

### Decision: Single file or separate?

Create a focused `UpdateTaskFromNLP.ts` use case. It receives the `ITimeParser` (which has AI + regex) for the merge, plus the `Task` entity for schema validation. This avoids creating a new interface and keeps the merge logic alongside the existing NLP pattern.

Constructor:
```ts
class UpdateTaskFromNLP {
  constructor(
    private timeParser: ITimeParser,
  ) {}
  
  async execute(dto: UpdateTaskFromNLPDTO): Promise<MergeResult>
}
```

`ITimeParser` already has an `execute(text, country)` method that returns `ParsedTask | null`. But for merge we need a different signature — input is `(originalTask, delta, country)`, output is `MergeResult`. **Add a separate method** to the existing `TimeParserService`:

```ts
async merge(originalTask: TaskData, delta: string, country?: string): Promise<{ merged: TaskData; diff: TaskDiff }>
```

Or better: create a new `IMergeService` interface and a `AiMergeService` that wraps the same AI client. This keeps concerns separated. But to minimize new files, we can add `merge` to `ITimeParser`:

```ts
interface ITimeParser {
  execute(text: string, country?: string): Promise<ParsedTask | null>;
  merge(originalTask: TaskData, delta: string, country?: string): Promise<MergeResult>;
}
```

Verdict: Add `merge` to `ITimeParser` and `TimeParserService`. It uses the same AI service with the merge prompt, and the same `regexFallback` but with overlay logic.

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `UpdateTaskFromNLP.merge` — valid delta, invalid delta, AI failure, regex fallback | Mock `ITimeParser.merge`. Test diff structure, error cases. |
| Unit | Controller handlers — state transitions, cancellation at each step | Unit test `handleTaskEditSelect/Delta/Confirm` with mock deps |
| Unit | Scheduler decision matrix | Test diff → action mapping |
| Integration | Full flow: list → select → edit → confirm → verify DB + scheduler | Use real Turso (in-memory/embedded) + real scheduler |
| Integration | Soft-delete+resurrect (undo soft-delete is out of scope but verify not found) | -- |

## Open Questions

- [ ] **Timezone merge**: Original task has ISO datetime without timezone. When AI re-parses "mover a las 3pm" relative to the original time, there's ambiguity. Do we pass the original user's country/timezone in the prompt even though the original task has no stored timezone?
- [ ] **Retry limit**: How many times do we let the user rephrase before aborting? (Proposal: 3, then return to menu)
- [ ] **MidAI contract**: Current MidAI doesn't support `systemPrompt` separately — it's merged into user prompt. Does this approach work for a much larger prompt with embedded task JSON? Need to verify token limits.
