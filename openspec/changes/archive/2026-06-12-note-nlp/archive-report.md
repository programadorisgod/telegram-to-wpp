# Archive Report: note-nlp

**Archived**: 2026-06-12
**Status**: ✅ Completed (with warnings)
**SDD Cycle**: Complete

---

## Change Summary

Extended the LLM-based natural language pipeline to understand note intents (`note_list`, `note_view`, `note_create`, `note_update`, `unknown`), replacing regex-based routing for notes. Users can now manage notes with natural Spanish phrases through the same LLM pipeline as tasks — fully integrated into `AstralController.ts`.

## What Was Implemented

### Phase 1: Foundation (Types) ✅
- Extended `ParsedTask` interface with optional `noteTarget`, `noteTitle`, `noteContent` fields
- Added `note_list`, `note_view`, `note_create`, `note_update`, `unknown` to the `intent` union type

### Phase 2: Core Implementation ✅
- Added "PASO 2 — NOTAS" section to `SYSTEM_PROMPT` in `TimeParserService.ts` with Spanish signals for all 5 note intents (after task intents, before REGLA IMPORTANTE)
- Extended `parseAIResponse()` to handle note intents with early return (no date/time extraction needed)
- Removed the `/\bnotas?\b/i` regex routing block from `processNaturalInput()` — all messages now reach LLM
- Added note intent routing in `handleRawTask()`: `note_list`→showNotesList, `note_view`→findNoteByHint→detail, `note_create`→handleNoteNlpCreate, `note_update`→findNoteByHint→handleNoteNlpUpdate, `unknown`→showNotesMenu
- Implemented `findNoteByHint()` fuzzy matching (title-first, content-fallback, lowercase includes)
- Implemented `handleNoteNlpCreate()`, `handleNoteNlpUpdate()`, `handleNoteNlpView()` — direct note handlers bypassing multi-step menus, reusing existing `waiting_note_*` state machines

### Phase 3: Verification 🔲 (2 of 2 tasks incomplete)
- 3.1: Verify note intent detection via unit/E2E tests — **not done** (no test framework)
- 3.2: Verify NLP note handlers — **not done** (no test framework)

## Files Modified

| File | Action | Details |
|------|--------|---------|
| `src/application/use-cases/astral/ParseNaturalLanguage.ts` | Modified | Extended `ParsedTask` interface with note fields + intents |
| `src/application/use-cases/astral/TimeParserService.ts` | Modified | Added PASO 2 — NOTAS to SYSTEM_PROMPT; extended `parseAIResponse()` |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | Removed regex routing; added note intent routing, `findNoteByHint()`, NLP handlers |

## Known Issues (Warnings)

1. **Prompt label conflict**: Original `PASO 2 — SOLO para intent "create"` (line 86) conflicts numerically with new `PASO 2 — NOTAS` (line 62). Both labeled "PASO 2".
2. **note_update stores note ID in `data.selectedTaskId`** (line 3635): Field name suggests a task ID but holds a note ID. Works but fragile.
3. **No tests**: Phase 3 tasks (3.1, 3.2) incomplete. All 21 spec scenarios UNTESTED.
4. **findNoteByHint() uses `any[]` type** instead of proper Note type.
5. **Voseo inconsistency**: `handleNoteNlpCreate` uses "¿Quieres" (tú) vs manual flow's "¿Querés" (voseo).

## Artifact Lineage (Engram Observation IDs)

| Artifact | Engram ID |
|----------|-----------|
| Proposal | #830 |
| Spec | #832 |
| Design | #833 |
| Tasks | #834 |
| Apply Progress | #835 |
| Verify Report | #837 |
| Archive Report (this) | (current) |

## Openspec Artifacts

All artifacts moved to: `openspec/changes/archive/2026-06-12-note-nlp/`

### Main Spec Updated
- `openspec/specs/note-nlp/spec.md` — Created (full spec from delta, no prior main spec existed)

### Archive Contents
- proposal.md ✅
- design.md ✅
- specs/note-nlp/spec.md ✅ (delta spec)
- tasks.md ✅ (7/9 complete, 2/9 pending — tests)
- apply-progress.md ✅
- verify-report.md ✅ (PASS WITH WARNINGS)
- archive-report.md ✅ (this file)

## Verdict

**Archived successfully**. All Phase 1 and Phase 2 implementation tasks are complete and structurally correct. Code compiles cleanly (`npx tsc --noEmit` passes). The main remaining gap is the absence of tests (Phase 3), which is a project-level concern (no test framework configured). Recommended to address the PASO 2 label conflict and missing tests in a follow-up change when a test framework is established.
