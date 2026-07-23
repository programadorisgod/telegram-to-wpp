# Proposal: LLM Intent Detection for Notes

## Intent

Notes currently route via regex in `processNaturalInput()` (AstralController.ts:125): if message contains "nota" + verb → direct handler, else → notes menu. The LLM (`TimeParserService`) only understands task intents (create/list/edit). Users can't say "qué notas tengo" or "actualiza la nota tal por esto" and get a natural response.

This change lets the LLM understand note intents, making note interactions as fluid as tasks.

## Scope

### In Scope
- Extend LLM prompt with `note_list`, `note_view`, `note_create`, `note_update`, `unknown` intents
- Parse new fields (`noteTarget`, `noteTitle`, `noteContent`) in `parseAIResponse()`
- Remove regex routing for notes in `processNaturalInput()` — full NLP flow
- Route note intents after LLM parse (list/view/create/update via direct handlers)
- Implement `findNoteByHint()` — fuzzy match on note title + content

### Out of Scope
- Project / Help routing (stay regex)
- Note CRUD state machines (unchanged)
- Image handling / media routing (unchanged)
- New features (delete, search)

## Capabilities

### New Capabilities
- `note-nlp`: LLM-based note intent detection — prompt extension, note routing after LLM parse, fuzzy note matching

### Modified Capabilities
- None — no existing spec requirements change

## Approach

1. **Extend `SYSTEM_PROMPT`** in `TimeParserService.ts` — add note intents after task intents, same JSON format
2. **Extend `ParsedTask`** type (`ParseNaturalLanguage.ts`) — add `noteTarget`, `noteTitle`, `noteContent`
3. **Extend `parseAIResponse()`** — handle note intents and extract note fields
4. **Remove regex block** (lines 125-134) from `processNaturalInput()` — let ALL messages reach `handleRawTask()`
5. **Route note intents** in a new handler (or extend `handleRawTask()`) — switch on `parsed.intent`
6. **Add `findNoteByHint()`** — fuzzy match on title + content similar to `findTaskByHint()`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/application/use-cases/astral/TimeParserService.ts` | Modified | SYSTEM_PROMPT + parseAIResponse |
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | Modified | ParsedTask type extension |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | Regex removal + intent routing + findNoteByHint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| LLM misclassifies ambiguous input as note vs task | Low | `unknown` intent → menu |
| Existing "nota" regex users notice behavior change | Low | unknown shows same menu |
| LLM hallucinates noteTarget | Med| findNoteByHint returns null → show list |

## Rollback Plan

Revert regex removal in `processNaturalInput()` (restore lines 125-134). Prompt changes are backward-compatible and can stay.

## Dependencies

None — all changes within existing modules.

## Success Criteria

- [ ] "qué notas tengo" → shows note list
- [ ] "crea una nota que diga X" → creates note directly (then asks about image)
- [ ] "actualiza la nota de X por Y" → fuzzy match + update + image prompt
- [ ] "mostrame la nota de X" → fuzzy match + show detail
- [ ] Ambiguous note input → shows notes menu
- [ ] Existing task NLP still works (create/list/edit)
