# Exploration: Split AstralController (145KB → 5 domain controllers)

## Current State

`AstralController.ts` is 4116 lines / 145KB with 75 methods and 28 constructor dependencies. It handles ALL domains: registration, tasks, notes, projects, audio, and shared utilities. Every message flow passes through this single class.

## Affected Areas

- `src/interface/whatsapp/features/astral/AstralController.ts` — Split into 5 files
- `src/interface/whatsapp/features/astral/AstralFeature.ts` — Update wiring to sub-controllers
- `src/interface/whatsapp/ConversationStateMachine.ts` — No changes (context strings preserved)
- `src/main.ts` — No changes (dependency injection unchanged)
- All 4033 lines of handler logic moved, zero behavior changes

## Method Categorization (75 methods → 5 controllers)

### RegistrationController (~120 lines, 4 methods)
- `startRegistration`, `handleRegisterConfirm`, `handleRegisterUsername`, `handleRegisterCountry`
- Dependencies: `registerUser`, `whatsappService`, `stateMachine`, `menuService`

### TaskController (~1800 lines, 28 methods)
- `enterTaskFlow`, `processNaturalInput`, `handleRawTask`, `showTaskConfirmation`, `handleTaskConfirm`, `handleTaskTime`, `proceedAfterTime`, `handleReminderConfig`, `handleFrequencyConfig`, `handleFrequencyDetail`, `handleFrequencyEnd`, `transitionAfterReminderConfig`, `createTaskWithReminder`, `enterEditTaskFlow`, `handleTaskEditSelect`, `handleTaskEditDelta`, `handleTaskEditConfirm`, `showTasksList`, `handleRecipientChoice`, `handleContactSearch`, `handleContactSelect`, `findTaskByHint`, `isShortTermTask`, `getReminderMode`, `parseReminderConfig`, `handleNoteNlpCreate`, `handleNoteNlpUpdate`, `handleNoteNlpView`
- Dependencies: ALL task-related use cases + `timeParser`, `taskRepo`, `scheduler`, `fileStorage`

### NoteController (~700 lines, 16 methods)
- `showNotesMenu`, `startCreateNote`, `handleNoteTitle`, `handleNoteContent`, `handleNoteImageConfirm`, `handleNoteImage`, `saveNoteWithoutImage`, `handleNoteImageMedia`, `showNotesList`, `handleNoteViewSelect`, `handleNoteViewMore`, `startUpdateNote`, `handleNoteUpdateSelect`, `handleNoteUpdateContent`, `handleNoteUpdateImage`, `handleNoteUpdateImageMedia`, `findNoteByHint`, `normalizeMatch`, `noteDisplayTitle`
- Dependencies: `createNote`, `queryNotes`, `updateNote`, `deleteNoteImage`, `fileStorage`

### ProjectController (~600 lines, 12 methods)
- `showProjects`, `handleProjectViewSelect`, `handleProjectViewMore`, `startCreateProject`, `handleRawProject`, `handleProjectName`, `showProjectMenu`, `startUpdateProject`, `enterProjectUpdateMode`, `handleProjectUpdateInner`, `handleProjectSelectForUpdate`, `handleProjectUpdate`, `handleProjectUpdateMore`, `handleProjectUpdateHistory`, `findProjectByHint`, `extractProjectName`
- Dependencies: `createProject`, `queryPendingProjects`, `logProjectUpdate`, `queryProjectUpdates`

### AudioController (~300 lines, 4 methods)
- `handleAudio`, `handleAudioConfirm`, `handleAudioEdit`
- Dependencies: `processAudioReminder`, `saveAudioReminder`, `fileStorage`

### Shared Utilities (remain in AstralController as thin orchestrator, ~100 lines)
- `backToAstralMenu`, `showNlpHelp`, `resolveCountryCode`, `COUNTRY_NAME_MAP` constant
- `handleWaiting` — becomes a router that delegates to the correct sub-controller

## Approaches

### Approach 1: Composition (Recommended)
Each sub-controller is a class instantiated by `AstralController`. `AstralController` becomes a thin router that delegates `handleWaiting` context strings to the correct sub-controller. All context strings remain unchanged.

**Pros**: Zero breaking changes, easy to test each controller independently, clear boundaries
**Cons**: `AstralController` still exists as orchestrator (but < 200 lines)
**Effort**: Medium

### Approach 2: Full Extraction
Remove `AstralController` entirely. `AstralFeature` directly instantiates and routes to sub-controllers.

**Pros**: Cleanest architecture, no orchestrator layer
**Cons**: Higher risk — `AstralFeature` needs significant refactoring, more changes to routing
**Effort**: High

### Approach 3: Partial Split
Only extract the largest domains (Task + Note), leave Registration + Audio + Project in `AstralController`.

**Pros**: Lower risk, smaller diff
**Cons**: Doesn't fully solve the god object problem
**Effort**: Low

## Recommendation

**Approach 1 (Composition)**. Each sub-controller gets its own file with explicit dependencies. `AstralController` becomes a ~100-line router. All 75 context strings in `ConversationStateMachine` remain unchanged — zero breaking changes to the state machine or `AstralFeature`.

## Risks

1. **Context string mismatch**: If any context string changes, the state machine routing breaks. Mitigation: keep ALL context strings identical.
2. **Dependency injection complexity**: Each sub-controller needs a subset of the 28 current dependencies. Mitigation: pass only what each needs.
3. **Shared utility methods**: `findTaskByHint`, `findProjectByHint`, `normalizeMatch` are used across domains. Mitigation: keep them in the orchestrator or extract to a shared utils file.

## Ready for Proposal

Yes. The approach is clear: composition-based split with 5 domain controllers + thin orchestrator. Zero breaking changes to state machine or feature routing.
