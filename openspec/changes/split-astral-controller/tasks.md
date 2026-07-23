# Tasks: Split AstralController into 5 Domain Controllers

## Phase 1: Small Controllers (Registration + Audio)

- [ ] 1.1 Create `src/interface/whatsapp/features/astral/RegistrationController.ts` with constructor (menuService, whatsappService, stateMachine, registerUser)
- [ ] 1.2 Move `startRegistration`, `handleRegisterConfirm`, `handleRegisterUsername`, `handleRegisterCountry` to RegistrationController
- [ ] 1.3 Create `src/interface/whatsapp/features/astral/AudioController.ts` with constructor (menuService, whatsappService, stateMachine, processAudioReminder, saveAudioReminder, fileStorage)
- [ ] 1.4 Move `handleAudio`, `handleAudioConfirm`, `handleAudioEdit` to AudioController
- [ ] 1.5 Verify `tsc --noEmit` passes

## Phase 2: Project Controller

- [ ] 2.1 Create `src/interface/whatsapp/features/astral/ProjectController.ts` with constructor (menuService, whatsappService, stateMachine, registerUser, createProject, queryPendingProjects, logProjectUpdate, queryProjectUpdates)
- [ ] 2.2 Move project methods: `showProjects`, `handleProjectViewSelect`, `handleProjectViewMore`, `startCreateProject`, `handleRawProject`, `handleProjectName`, `showProjectMenu`, `startUpdateProject`, `enterProjectUpdateMode`, `handleProjectUpdateInner`, `handleProjectSelectForUpdate`, `handleProjectUpdate`, `handleProjectUpdateMore`, `handleProjectUpdateHistory`, `findProjectByHint`, `extractProjectName`
- [ ] 2.3 Verify `tsc --noEmit` passes

## Phase 3: Note Controller

- [ ] 3.1 Create `src/interface/whatsapp/features/astral/NoteController.ts` with constructor (menuService, whatsappService, stateMachine, createNote, queryNotes, updateNote, deleteNoteImage, fileStorage)
- [ ] 3.2 Move note methods: `showNotesMenu`, `startCreateNote`, `handleNoteTitle`, `handleNoteContent`, `handleNoteImageConfirm`, `handleNoteImage`, `saveNoteWithoutImage`, `handleNoteImageMedia`, `showNotesList`, `handleNoteViewSelect`, `handleNoteViewMore`, `startUpdateNote`, `handleNoteUpdateSelect`, `handleNoteUpdateContent`, `handleNoteUpdateImage`, `handleNoteUpdateImageMedia`, `findNoteByHint`, `normalizeMatch`, `noteDisplayTitle`
- [ ] 3.3 Verify `tsc --noEmit` passes

## Phase 4: Task Controller (Largest)

- [ ] 4.1 Create `src/interface/whatsapp/features/astral/TaskController.ts` with constructor (menuService, whatsappService, stateMachine, registerUser, timeParser, createTaskFromNLP, queryPendingTasks, updateTaskFromNLP, taskRepo, scheduler, fileStorage)
- [ ] 4.2 Move task methods: `enterTaskFlow`, `processNaturalInput`, `handleRawTask`, `showTaskConfirmation`, `handleTaskConfirm`, `handleTaskTime`, `proceedAfterTime`, `handleReminderConfig`, `handleFrequencyConfig`, `handleFrequencyDetail`, `handleFrequencyEnd`, `transitionAfterReminderConfig`, `createTaskWithReminder`, `enterEditTaskFlow`, `handleTaskEditSelect`, `handleTaskEditDelta`, `handleTaskEditConfirm`, `showTasksList`, `handleRecipientChoice`, `handleContactSearch`, `handleContactSelect`, `findTaskByHint`, `isShortTermTask`, `getReminderMode`, `parseReminderConfig`, `handleNoteNlpCreate`, `handleNoteNlpUpdate`, `handleNoteNlpView`
- [ ] 4.3 Verify `tsc --noEmit` passes

## Phase 5: AstralController Refactor (Orchestrator)

- [ ] 5.1 Remove all moved methods from `AstralController.ts`
- [ ] 5.2 Instantiate sub-controllers in AstralController constructor with selective dependencies
- [ ] 5.3 Rewrite `handleWaiting` as router delegating to sub-controllers based on context prefix
- [ ] 5.4 Keep shared utilities in AstralController: `backToAstralMenu`, `showNlpHelp`, `resolveCountryCode`, `COUNTRY_NAME_MAP`
- [ ] 5.5 Update `AstralFeature.ts` wiring to pass dependencies to AstralController
- [ ] 5.6 Verify `tsc --noEmit` passes

## Phase 6: Verification

- [ ] 6.1 Run `tsc --noEmit` and fix any type errors
- [ ] 6.2 Manual test: Registration flow (register, username, country)
- [ ] 6.3 Manual test: Task flow (create via NLP, confirm, schedule, edit)
- [ ] 6.4 Manual test: Note flow (create, image, update)
- [ ] 6.5 Manual test: Project flow (create, view, update)
- [ ] 6.6 Manual test: Audio flow (send audio, transcribe, confirm)
- [ ] 6.7 Verify all 75 context strings match original values exactly