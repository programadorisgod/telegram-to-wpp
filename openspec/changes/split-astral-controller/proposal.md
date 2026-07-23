# Proposal: Split AstralController into 5 Domain Controllers

## Intent

`AstralController.ts` is 4116 lines / 145KB with 75 methods and 28 constructor dependencies — a god object that handles registration, tasks, notes, projects, and audio in a single file. This makes it impossible to review, test, or maintain. Splitting it into domain-specific controllers reduces cognitive load and enables independent testing of each domain.

## Scope

### In Scope
- Create `RegistrationController.ts` (4 methods, ~120 lines)
- Create `TaskController.ts` (28 methods, ~1800 lines)
- Create `NoteController.ts` (16 methods, ~700 lines)
- Create `ProjectController.ts` (12 methods, ~600 lines)
- Create `AudioController.ts` (4 methods, ~300 lines)
- Reduce `AstralController.ts` to ~100-line orchestrator/router
- Preserve ALL 75 ConversationStateMachine context strings unchanged

### Out of Scope
- Changing any message flow behavior or user-facing text
- Modifying ConversationStateMachine or AstralFeature routing logic
- Adding new features or fixing existing bugs
- Worker queue or scheduler changes (separate changes)

## Capabilities

### New Capabilities
None — this is a pure refactor with zero behavior changes.

### Modified Capabilities
- `task-crud`: Task handlers moved to TaskController (behavior unchanged)
- `media-cleanup`: Note handlers moved to NoteController (behavior unchanged)

## Approach

Composition-based split. Each sub-controller is a class with explicit dependencies injected by `AstralController`. The `handleWaiting` method becomes a router that delegates to the correct sub-controller based on context string prefix. All context strings remain identical — zero breaking changes to the state machine.

Shared utilities (`findTaskByHint`, `findProjectByHint`, `normalizeMatch`, `COUNTRY_NAME_MAP`) remain in the orchestrator since they're used across domains.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | Reduced from 4116 to ~100 lines (router + shared utils) |
| `src/interface/whatsapp/features/astral/RegistrationController.ts` | New | Registration flow methods |
| `src/interface/whatsapp/features/astral/TaskController.ts` | New | Task CRUD, NLP, reminders, frequency, contacts |
| `src/interface/whatsapp/features/astral/NoteController.ts` | New | Note CRUD, image handling, OCR |
| `src/interface/whatsapp/features/astral/ProjectController.ts` | New | Project CRUD, updates, history |
| `src/interface/whatsapp/features/astral/AudioController.ts` | New | Audio processing, transcription |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Modified | Wiring updated to pass deps to sub-controllers |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Context string mismatch breaks routing | Low | Keep ALL context strings identical to current values |
| Dependency injection complexity | Medium | Each controller receives only the deps it needs |
| Shared utility methods used across domains | Low | Keep shared utils in orchestrator |

## Rollback Plan

Single commit revert: `git revert <commit-hash>`. Since this is a pure refactor with zero behavior changes, reverting restores the monolithic controller with no data migration needed.

## Dependencies

- Performance audit changes (already merged) must be present
- No new external dependencies required

## Success Criteria

- [ ] `AstralController.ts` < 200 lines
- [ ] All 5 sub-controllers compile with `tsc --noEmit`
- [ ] All 75 context strings match original values exactly
- [ ] Manual test: register, create task, create note, create project, send audio — all flows work identically
- [ ] No changes to `ConversationStateMachine.ts` behavior
