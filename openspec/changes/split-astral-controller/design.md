# Design: Split AstralController into 5 Domain Controllers

## Technical Approach

Composition-based split. `AstralController` becomes a ~100-line router that instantiates 5 sub-controllers and delegates `handleWaiting` context strings to the correct one. All 75 context strings remain identical. Zero behavior changes.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Split strategy | Composition vs inheritance | Inheritance couples controllers; composition is testable | Composition: each sub-controller is a standalone class |
| Shared utilities | Extract to utils file vs keep in orchestrator | Utils file adds indirection; orchestrator keeps them visible | Keep in orchestrator (used across domains) |
| handleWaiting routing | Prefix matching vs explicit switch | Prefix is fragile; switch is explicit and type-safe | Explicit switch in orchestrator, delegates to sub-controller methods |
| Dependency injection | Pass all 28 deps to each vs selective | Selective is cleaner but requires careful mapping | Selective: each controller receives only its domain deps |
| Context string preservation | Rename to domain-prefixed vs keep identical | Renaming breaks existing sessions; keeping is zero-risk | Keep ALL context strings identical |

## Data Flow

```
Message arrives → AstralFeature.handleWaitingInput()
    └── AstralController.handleWaiting(sender, text, context, stateData)
            ├── context starts with "waiting_register_*"
            │   └── RegistrationController.handleRegister*(sender, text, stateData)
            ├── context starts with "waiting_task_*" or "waiting_frequency_*" or "waiting_reminder_*" or "waiting_contact_*" or "waiting_recipient_*"
            │   └── TaskController.handle*(sender, text, stateData)
            ├── context starts with "waiting_note_*"
            │   └── NoteController.handle*(sender, text, stateData)
            ├── context starts with "waiting_project_*"
            │   └── ProjectController.handle*(sender, text, stateData)
            ├── context starts with "waiting_audio_*"
            │   └── AudioController.handle*(sender, text, stateData)
            └── default → false (unhandled)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/interface/whatsapp/features/astral/RegistrationController.ts` | Create | 4 methods: startRegistration, handleRegisterConfirm, handleRegisterUsername, handleRegisterCountry |
| `src/interface/whatsapp/features/astral/TaskController.ts` | Create | 28 methods: task CRUD, NLP, reminders, frequency, contacts, edit flow |
| `src/interface/whatsapp/features/astral/NoteController.ts` | Create | 16 methods: note CRUD, image handling, OCR, fuzzy matching |
| `src/interface/whatsapp/features/astral/ProjectController.ts` | Create | 12 methods: project CRUD, updates, history, fuzzy matching |
| `src/interface/whatsapp/features/astral/AudioController.ts` | Create | 4 methods: handleAudio, handleAudioConfirm, handleAudioEdit |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | Reduced to ~100-line orchestrator: constructor, handleWaiting router, shared utils |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Modified | Wiring updated to pass deps to sub-controllers |

## Interfaces / Contracts

Each sub-controller follows the same pattern:

```typescript
class TaskController {
    constructor(
        private menuService: AstralMenuService,
        private whatsappService: IWhatsAppService,
        private stateMachine: ConversationStateMachine,
        private registerUser: RegisterUser,
        private timeParser: ITimeParser,
        private createTaskFromNLP: CreateTaskFromNLP,
        private queryPendingTasks: QueryPendingTasks,
        private updateTaskFromNLP: UpdateTaskFromNLP,
        private taskRepo: IAstralTaskRepository,
        private scheduler: ISchedulerService,
        private fileStorage: IFileStorage,
    ) {}

    // All task-related handlers
    async enterTaskFlow(sender: string): Promise<void> { ... }
    async handleRawTask(sender: string, text: string, data: Record<string, any>): Promise<true> { ... }
    // ... 26 more methods
}
```

The orchestrator's `handleWaiting` becomes:

```typescript
async handleWaiting(sender: string, text: string, context: string, stateData: Record<string, any>): Promise<boolean> {
    if (context.startsWith("waiting_register_")) return this.registrationController.handleWaiting(context, sender, text, stateData);
    if (context.startsWith("waiting_task_") || context.startsWith("waiting_frequency_") || ...) return this.taskController.handleWaiting(context, sender, text, stateData);
    if (context.startsWith("waiting_note_")) return this.noteController.handleWaiting(context, sender, text, stateData);
    if (context.startsWith("waiting_project_")) return this.projectController.handleWaiting(context, sender, text, stateData);
    if (context.startsWith("waiting_audio_")) return this.audioController.handleWaiting(context, sender, text, stateData);
    return false;
}
```

## Testing Strategy

No test framework installed. Manual verification plan:

| Flow | Verify | How |
|------|--------|-----|
| Registration | Full flow | Start bot, register with username + country |
| Task creation | NLP + manual | "comprar leche mañana", confirm, schedule |
| Task edit | Edit flow | "editar tarea de X", modify, confirm |
| Note creation | Title + content + image | Create note, send image, verify OCR |
| Note update | Select + update content | Update existing note |
| Project creation | Create + view | Create project, view history |
| Project update | Select + update | Update project status |
| Audio reminder | Send audio, confirm | Record audio, verify transcription, schedule |
| Context preservation | All 75 strings | Grep context strings, compare with original |

## Migration / Rollout

No migration required. Pure refactor with zero behavior changes. Single commit revert if issues arise.

## Open Questions

- None — all decisions resolved by existing patterns and constraints
