# Tasks: Astral Remember All

## Phase 1: Foundation (DB schema, env, deps)

- [x] 1.1 Create `packages/db-core/src/schema/` with 5 Drizzle tables: users, tasks, projects, image_reminders, audio_reminders
- [x] 1.2 Create `packages/db-core/src/schema/index.ts` barrel + update `packages/db-core/src/index.ts` to re-export
- [x] 1.3 Extend `src/infrastructure/config/env.ts` — add TURSO_URL, TURSO_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, AUDIO_GROQ_API_KEY
- [x] 1.4 Install deps: @libsql/client, tesseract.js, groq-sdk, @supabase/supabase-js, node-cron, @types/node-cron

## Phase 2: Ports + Infrastructure Adapters

- [x] 2.1 Create 5 Astral repos + 4 service ports in `src/application/ports/`:
  - IAstralUserRepository, IAstralTaskRepository, IAstralProjectRepository, IAstralImageReminderRepository, IAstralAudioReminderRepository
  - IOcrService, ITranscriptionService, IFileStorage, ISchedulerService
- [x] 2.2 Create 5 Turso repo adapters in `src/infrastructure/db/`:
  - TursoUserRepository, TursoTaskRepository, TursoProjectRepository, TursoImageReminderRepository, TursoAudioReminderRepository
- [x] 2.3 Create `src/infrastructure/storage/SupabaseFileStorage.ts` — upload/delete via Supabase Storage
- [x] 2.4 Create `src/infrastructure/transcription/GroqTranscriptionService.ts` — Groq whisper-large-v3 with duration validation
- [x] 2.5 Create `src/infrastructure/ocr/TesseractOcrService.ts` — tesseract.js single-use worker with Spanish OCR
- [x] 2.6 Create `src/infrastructure/scheduler/NodeCronScheduler.ts` — node-cron lifecycle manager
- [x] 2.7 Create domain entities in `src/domain/entities/astral/`:
  - User.ts, Task.ts (with ReminderConfig VO), Project.ts, AstralReminder.ts

## Phase 3: Application Use Cases

- [x] 3.1 Create `src/application/use-cases/astral/RegisterUser.ts` — Check if exists, create with Zod validation
- [x] 3.2 Create `src/application/use-cases/astral/ParseNaturalLanguage.ts` — Regex-first Spanish NLP: date/time/description extraction
- [x] 3.3 Create `src/application/use-cases/astral/CreateTaskFromNLP.ts` — Takes parsed NL + reminder config, persists + schedules
- [x] 3.4 Create `src/application/use-cases/astral/CreateProject.ts` — Creates project with empty task lists
- [x] 3.5 Create `src/application/use-cases/astral/QueryPendingProjects.ts` — Returns projects ordered by priority
- [x] 3.6 Create `src/application/use-cases/astral/ProcessImageReminder.ts` — OCR + Supabase upload + persist
- [x] 3.7 Create `src/application/use-cases/astral/ProcessAudioReminder.ts` — Duration validation → Groq → Supabase → persist
- [x] 3.8 Create `src/application/use-cases/astral/ReminderScheduler.ts` — Re-register pending reminders on boot

## Phase 4: Feature Layer (Batch 2)

- [x] 4.1 Create `src/interface/whatsapp/features/astral/AstralMenuService.ts` — menu text, registration prompts, help
- [x] 4.2 Create `src/interface/whatsapp/features/astral/AstralController.ts` — state machine with handleWaiting() switch
- [x] 4.3 Create `src/interface/whatsapp/features/astral/AstralFeature.ts` — BotFeature impl, name="astral", alias "recordar"
- [x] 4.4 Create `src/interface/whatsapp/features/astral/index.ts` — barrel export

## Phase 5: Wiring (Batch 2)

- [x] 5.1 (Not needed — registration gate lives inside AstralFeature, not in MessageHandler)
- [x] 5.2 Modify `src/main.ts` — instantiate AstralFeature with all deps, add to features[], init ReminderScheduler
- [x] 5.3 (Already done in Batch 1 — deps installed in Phase 1.4)

## Phase 6: Verify

- [x] 6.1 Run `tsc --noEmit` — passes with zero errors
