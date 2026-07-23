# Design: LLM Intent Detection for Notes

## Technical Approach

Extend the existing LLM prompt (`SYSTEM_PROMPT` in `TimeParserService.ts`) with note intents — task intents keep priority, then note intents, then `unknown` → menu. Reuse `ParsedTask` with optional fields. Remove the regex routing block in `processNaturalInput()` so ALL messages reach `handleRawTask()`, then add an `else if` chain for note intents. Add `findNoteByHint()` (fuzzy match on title/content) and three direct note handlers that bypass the multi-step menu flows.

## Architecture Decisions

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| New `ParsedNote` type vs extend `ParsedTask` | New type = cleaner separation but forces branching at every routing point. Extend = one parse pipeline, one return type, less branching | **Extend `ParsedTask`** — add `noteTarget`, `noteTitle`, `noteContent` as optional `string` fields. New `intent` values: `note_list`, `note_view`, `note_create`, `note_update`, `unknown`. Keeps LLM response parsing unified. |
| New handler vs extend `handleRawTask` | New handler keeps concerns separated but duplicates the "thinking" message and state setup. Extension is simpler. | **Extend `handleRawTask()`** — add an `else if` chain for note intents AFTER existing task intent checks (tasks take priority on ambiguous input). |
| Remove regex vs deprecate | Remove creates behavior change for existing users; deprecate is safer but leaves dead code. | **Remove regex block** — the `unknown` intent routes to `showNotesMenu()` which matches current regex behavior for non-matching note messages. Low migration risk. |
| Strict match vs fuzzy for `findNoteByHint` | Strict = no false positives but misses partial matches. Fuzzy = better UX with low risk (short note titles). | **Fuzzy** — lowercase, includes check on title (priority), then content. Returns first match. Returns `null` if none match. Follows `findTaskByHint` pattern but simpler (no exact match priority needed). |
| New state for NLP note vs reuse existing | New states = more complexity. Reuse existing image states = consistent UX, less code. | **Reuse existing states** — `waiting_note_image_confirm` for create, `waiting_note_update_image` for update. Pre-fill data from LLM output. |

## Data Flow

```
User message ──→ processNaturalInput()
                     │
                     ├── projects regex (unchanged)
                     ├── help regex (unchanged)
                     └── handleRawTask() ←──── ALL messages now flow here
                              │
                    ┌─────────┼─────────┐
                    │         │         │
               list/edit   note_*   create (fallback)
                  │         │         │
              existing   findNoteBy   showTask
              task flow  Hint()      Confirmation
                           │
                   ┌───────┴───────┐
                   │               │
               found            null
                   │               │
            NLP note handler   showNotesMenu()
            (direct save)      (manual select)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | Modify | Extend `ParsedTask` with `noteTarget?`, `noteTitle?`, `noteContent?`; add note intents to `intent` union |
| `src/application/use-cases/astral/TimeParserService.ts` | Modify | Add note intent section to `SYSTEM_PROMPT` (after task intents); extend `parseAIResponse()` to handle note intents and extract note fields |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modify | Remove notes regex block (lines 124-134); add note routing in `handleRawTask()`; add `findNoteByHint()`; add `handleNoteNlpCreate`, `handleNoteNlpUpdate`, `handleNoteNlpView` |

## Interfaces / Contracts

```typescript
// ── Extended ParsedTask (ParseNaturalLanguage.ts) ──
export interface ParsedTask {
    date: Date;
    time?: string;
    description: string;
    recipient?: string;
    frequency?: RecurrenceFrequency;
    intent?: "create" | "list" | "edit" | "note_list" | "note_view" | "note_create" | "note_update" | "unknown";
    targetHint?: string;
    dates?: MultiDateEntry[];
    // New note fields (all optional):
    noteTarget?: string;  // description of the note the user refers to
    noteTitle?: string;   // title for a new/updated note
    noteContent?: string; // content for a new/updated note
}

// ── New method (AstralController) ──
private findNoteByHint(notes: Note[], hint: string): Note | null;
// Algorithm: lowercase both → title includes hint (priority) → content includes hint → first match → null
```

## Prompt Extension Strategy

Add to `SYSTEM_PROMPT` after task intent rules (after line 134, before the JSON-only closing):

```
PASO 3 — NOTAS (consultar después de tareas):
Primero: ¿el usuario pregunta por notas existentes?
→ {"intent":"note_list", "noteTarget": null, "noteTitle": null, "noteContent": null}
Señales: "qué notas", "mostrame las notas", "dame las notas", "lista de notas".

Segundo: ¿el usuario menciona UNA NOTA específica y quiere VERLA?
→ {"intent":"note_view", "noteTarget": "<descripción de la nota>", ...}
Señales: "mostrame la nota de X", "cómo era la nota de X", "dame la nota de X", "la nota de X".
noteTarget: extraé la palabra o frase clave que identifica LA NOTA.
Ej: "mostrame la nota de la entrevista" → noteTarget: "entrevista"

Tercero: ¿el usuario quiere CREAR una nota (con contenido explícito)?
→ {"intent":"note_create", "noteTitle": "<título>", "noteContent": "<contenido>", ...}
Señales: "crea una nota", "anotá", "guardá esto", "tomá nota de X".
Si no hay título claro: noteTitle: null. Si hay contenido: extraelo.

Cuarto: ¿el usuario quiere ACTUALIZAR el contenido de una nota existente?
→ {"intent":"note_update", "noteTarget": "<descripción de la nota>", "noteContent": "<nuevo contenido>", ...}
Señales: "actualizá la nota de X", "modificá la nota de X por Y", "cambiá la nota de X".
noteTarget: lo que identifica la nota existente.
noteContent: el nuevo contenido (lo que va DESPUÉS de "por", "con", etc.)

Quinto: si hay mención de "nota" pero no queda claro qué hacer:
→ {"intent":"unknown"}
```

## Error Handling

| Condition | Response |
|-----------|----------|
| LLM returns `note_view`/`note_update` without `noteTarget` | `showNotesMenu(sender)` — show list for manual selection |
| `findNoteByHint()` returns `null` | Show notes list for manual selection |
| LLM fails entirely or returns `null` | `showNotesMenu(sender)` — graceful degradation |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `parseAIResponse` with note intents | Mock LLM returning note JSON; verify correct `ParsedTask` with note fields |
| Unit | `findNoteByHint` fuzzy matching | Test title match, content match, null return, case insensitivity |
| Integration | Note NLP handlers create/update | Wire up use cases; verify `CreateNote`/`UpdateNote` called with expected params |
| E2E | Full flow: "crea una nota que diga X" → note created | Simulate chat session through `processNaturalInput` → verify DB state |

## Migration / Rollout

No migration required. Prompt changes are backward-compatible — old clients get the same task parsing. The regex removal is the only behavioral change: messages containing "nota" will now hit the LLM instead of regex. The `unknown` intent routes to the same menu as the current regex fallback, so existing users see no difference.

## Open Questions

- None.
