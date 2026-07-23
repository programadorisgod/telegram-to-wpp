# Design: Astral Remember All

## Technical Approach

New `BotFeature` implementation (`astral`) following the exact DCM pattern: single `AstralController` with `ConversationStateMachine` waiting states, an `AstralMenuService` for text rendering, and an `AstralFeature` wrapper. Registration gate added to `MessageHandler` before auth check — unregistered users are intercepted and routed into registration flow. New Drizzle schemas live inside `packages/db-core/src/schema/` to keep DB types co-located with the factory that creates the driver-bound instance.

## Architecture Decisions

| Decision | Options | Tradeoffs | Chosen |
|----------|---------|-----------|--------|
| Controller count | Single vs multi | Multi adds dispatch complexity; single follows DCM exactly | Single `AstralController` with `handleWaiting()` switch |
| NLP parsing | Regex-only vs regex+AI | AI costs $, adds latency; regex covers 90% of Spanish date patterns | Regex-first, Groq fallback for unparseable input |
| Schema location | `packages/db-core/src/schema/` vs `src/infrastructure/schema/` | Drizzle needs schema object at DB init; co-located in db-core keeps the factory/schema coupling tight | `packages/db-core/src/schema/` |
| Repository pattern | Port/adapter vs direct Drizzle | No existing repository abstraction in codebase; DCM uses use-case → port → adapter. Consistency wins. | Port/adapter: `IUserRepository` et al in `application/ports/`, Turso adapters in `infrastructure/database/` |
| File storage | Supabase Storage vs local FS | Supabase means network latency but survives restarts and Raspberry Pi reboots | Supabase Storage |
| Image retrieval | Public URL vs signed URL | Bucket has RLS policies requiring authenticated access — `getPublicUrl()` returns 400 even with auth headers. Signed URLs embed JWT in the URL itself. | `createSignedUrl()` (60s expiry) |
| Cron persistence | In-memory with DB re-register | In-memory is simpler and cron state is cheap; DB re-register on startup handles process restart | In-memory scheduler, re-register from DB on boot |

## Data Flow

```
User msg ──→ MessageHandler
               ├── Unregistered? → RegistrationController (collect username → country → DB)
               └── Registered?
                    ├── Text match "recordar" → AstralFeature submenu
                    │    └── Parse text → NLPTaskParser → confirm → reminder config → DB → cron
                    ├── Image → Supabase Storage → tesseract.js OCR → associate reminder
                    ├── Audio → Supabase Storage → Groq whisper → associate reminder
                    └── Query "proyectos" → TaskService → project list

Cron tick ──→ TaskService.sendReminder() → IWhatsAppService.sendMessage()
```

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `packages/db-core/src/schema/users.ts` | Create | Drizzle schema: users table |
| `packages/db-core/src/schema/tasks.ts` | Create | Drizzle schema: tasks table |
| `packages/db-core/src/schema/projects.ts` | Create | Drizzle schema: projects table |
| `packages/db-core/src/schema/reminders.ts` | Create | Drizzle schema: reminders (image/audio/regular) |
| `packages/db-core/src/schema/index.ts` | Create | Barrel export for all schemas |
| `packages/db-core/src/index.ts` | Modify | Export new schema barrel |
| `src/application/ports/IUserRepository.ts` | Create | Port: user persistence |
| `src/application/ports/ITaskRepository.ts` | Create | Port: task CRUD |
| `src/application/ports/IProjectRepository.ts` | Create | Port: project queries |
| `src/application/ports/IReminderRepository.ts` | Create | Port: reminder persistence |
| `src/application/ports/IFileStorage.ts` | Create | Port: image/audio upload |
| `src/application/ports/IAudioTranscriber.ts` | Create | Port: Groq transcription |
| `src/application/ports/IOcrProcessor.ts` | Create | Port: tesseract.js OCR |
| `src/application/ports/INLPTaskParser.ts` | Create | Port: text → structured task |
| `src/application/services/UserRegistrationService.ts` | Create | Application service: register + check |
| `src/application/services/TaskService.ts` | Create | Application service: CRUD + cron registration |
| `src/application/services/NLPTaskParser.ts` | Create | Regex-first Spanish task parser |
| `src/application/services/OcrService.ts` | Create | tesseract.js wrapper |
| `src/application/services/AudioService.ts` | Create | Groq API transcription wrapper |
| `src/application/services/ReminderScheduler.ts` | Create | node-cron lifecycle manager |
| `src/infrastructure/database/TursoUserRepository.ts` | Create | Adapter: Turso users |
| `src/infrastructure/database/TursoTaskRepository.ts` | Create | Adapter: Turso tasks |
| `src/infrastructure/database/TursoProjectRepository.ts` | Create | Adapter: Turso projects |
| `src/infrastructure/database/TursoReminderRepository.ts` | Create | Adapter: Turso reminders |
| `src/infrastructure/storage/SupabaseStorage.ts` | Create | Adapter: Supabase Storage |
| `src/infrastructure/ai/GroqTranscriber.ts` | Create | Adapter: Groq whisper |
| `src/infrastructure/ai/TesseractOcr.ts` | Create | Adapter: tesseract.js |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Create | BotFeature impl |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Create | State machine controller |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Create | Menu + prompt text |
| `src/interface/whatsapp/features/astral/index.ts` | Create | Barrel export |
| `src/interface/whatsapp/MessageHandler.ts` | Modify | Registration gate before auth check |
| `src/interface/whatsapp/ConversationStateMachine.ts` | Modify | Add `isRegistered()` helper? No — handled in handler |
| `src/infrastructure/config/env.ts` | Modify | +AUDIO_GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, TZ |
| `src/main.ts` | Modify | Wire AstralFeature, init cron, start scheduler |
| `package.json` | Modify | +tesseract.js, groq-sdk, @supabase/supabase-js, node-cron |

## Interfaces / Contracts

```typescript
// Application ports (new)
interface IUserRepository {
  findBySender(sender: string): Promise<User | null>;
  create(dto: CreateUserDTO): Promise<User>;
}

interface ITaskRepository {
  create(dto: CreateTaskDTO): Promise<Task>;
  findBySender(sender: string, filters?: TaskFilters): Promise<Task[]>;
  update(id: string, dto: UpdateTaskDTO): Promise<Task>;
  delete(id: string): Promise<void>;
}

interface IReminderRepository {
  create(dto: CreateReminderDTO): Promise<Reminder>;
  findDue(): Promise<Reminder[]>;
  markSent(id: string): Promise<void>;
}

interface IFileStorage {
  upload(fileName: string, buffer: Buffer, contentType: string): Promise<string>;
  delete(url: string): Promise<void>;
  getSignedUrl(url: string, expiresIn?: number): Promise<string | null>;
}

interface IAudioTranscriber {
  transcribe(audioBuffer: Buffer, mime: string): Promise<string>;
}

interface IOcrProcessor {
  extractText(imageBuffer: Buffer): Promise<string>;
}

interface INLPTaskParser {
  parse(text: string): ParsedTask | null;
}

// Domain types
interface ParsedTask {
  date: Date;
  time?: string;
  description: string;
}

type ReminderConfig = {
  before1d: boolean;
  before3h: boolean;
  before1h: boolean;
  atExact: boolean;
};

// Drizzle schema types (in db-core)
// users: id, sender (whatsapp number), username, country, created_at
// tasks: id, user_id, description, due_date, due_time, project_id, priority, completed, created_at
// projects: id, user_id, name, priority, periodic_reminder, created_at
// reminders: id, task_id, type (text/image/audio), config (json), file_url, sent, created_at
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| NLP Parser | Date/time extraction from Spanish text | Manual: script that pipes test sentences through parser |
| Audio/OCR | Transcription and text extraction | Manual: test with sample files |
| Controller flows | Registration → task creation → reminder config | Manual: WhatsApp conversation walkthrough |
| Cron scheduler | Reminder delivery at due time | Manual: schedule a 2-min-ahead reminder and observe |
| DB schemas | Schema compilation | `tsc --noEmit` catches type errors |
| Feature wiring | Registration gate in MessageHandler | Manual: message from unknown number triggers registration |

No automated test infrastructure exists in the project. All verification is manual walkthrough of the success criteria from the proposal.

## Migration / Rollout

No data migration needed — new tables only. Existing DCM feature is unaffected. Rollout steps:

1. Add env vars, install deps, run `tsc --noEmit`
2. Push new Drizzle schemas to Turso (manually run `drizzle-kit push` or raw SQL from the generated schema)
3. Deploy and verify registration gate works
4. Walk through each capability (task NLP, image OCR, audio transcription, reminders, project queries)

Rollback: see proposal rollback plan — remove feature from features array, revert MessageHandler, delete tables.

## Open Questions

- [ ] Should NLP fallback to Groq when regex fails, or just reject the input? Proposal says regex-first with fallback — but fallback adds latency and cost. Rejecting with "no entendí la fecha" might be better UX for v1.
- [ ] Reminder scheduler state is in-memory — on process restart, tasks with past due dates will be missed. Should we fire missed reminders on startup or skip them?
