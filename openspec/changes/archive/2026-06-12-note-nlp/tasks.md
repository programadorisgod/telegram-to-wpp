# Tasks: LLM Intent Detection for Notes

## Phase 1: Foundation (Types)

- [x] 1.1 **Extend `ParsedTask` type** (`ParseNaturalLanguage.ts`): add optional `noteTarget`, `noteTitle`, `noteContent` fields; extend `intent` union with `note_list`, `note_view`, `note_create`, `note_update`, `unknown`

## Phase 2: Core Implementation

- [x] 2.1 **Add note intent section to SYSTEM_PROMPT** (`TimeParserService.ts`): insert PASO 2 after task intents with Spanish signals for note_list/view/create/update/unknown; keep task intents as priority
- [x] 2.2 **Extend `parseAIResponse()`** (`TimeParserService.ts`): handle note intents — extract `noteTarget`, `noteTitle`, `noteContent` from LLM JSON; return early with new fields for note intents; preserve backward compat for task intents
- [x] 2.3 **Remove notes regex routing** (`AstralController.ts`): delete the `/\bnotas?\b/i` block from `processNaturalInput()`; all messages now flow to `handleRawTask()`
- [x] 2.4 **Add note intent routing in `handleRawTask()`** (`AstralController.ts`): after existing task intent checks, add else-if for `note_list`→`showNotesList`, `note_view`→`findNoteByHint()`→detail, `note_create`→`handleNoteNlpCreate`, `note_update`→`findNoteByHint()`→`handleNoteNlpUpdate`, `unknown`→`showNotesMenu`; keep `!parsed` fallback
- [x] 2.5 **Implement `findNoteByHint()`** (`AstralController.ts`): fuzzy match — lowercase note title includes hint (priority), then content includes hint; return first match or null; mirror `findTaskByHint()` pattern
- [x] 2.6 **Implement NLP note handlers** (`AstralController.ts`): `handleNoteNlpCreate(sender, title, content, data)` — save via `createNote.execute()`, ask about image via `waiting_note_image_confirm` state; `handleNoteNlpUpdate(sender, noteId, content, data)` — update via `updateNote.execute()`, ask about image via `waiting_note_update_image` state; `handleNoteNlpView(sender, note, data)` — show detail + image if present, return to notes menu

## Phase 3: Verification

- [ ] 3.1 **Verify note intent detection** — unit test `parseAIResponse()` with note JSON; E2E test "crea una nota que diga X" hits note_create flow
- [ ] 3.2 **Verify NLP note handlers** — test create/update via NLP bypasses multi-step menus; verify image state machines untouched; verify `findNoteByHint()` fuzzy matching
