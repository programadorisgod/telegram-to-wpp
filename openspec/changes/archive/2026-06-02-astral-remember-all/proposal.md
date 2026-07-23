# Proposal: Astral Remember All

## Intent

Users need a personal task assistant within WhatsApp — register once, then capture tasks via natural language, organize them by project, attach images/audio, and receive smart reminders. Currently the bot only manages tailoring clients (DCM). This extends it into a full personal productivity tool.

## Scope

### In Scope
- User registration flow (username + country ISO-3166, persisted in Turso)
- NLP task parsing from free text (date/time/description extraction)
- Task CRUD with combinable reminder config (1d / 3h / 1h / exact)
- Project tracking with completed/pending tasks, priority ordering, periodic reminders
- Image reminders with OCR (tesseract.js)
- Audio reminders via Groq whisper-large-v3 (≤20s)
- File storage via Supabase Storage for images/audio
- Scheduler via node-cron for reminder delivery

### Out of Scope
- Multi-language NLP (Spanish-first, no i18n)
- Voice message transcription in Telegram bridge
- Recurring tasks (single-instance only for v1)
- Calendar integration (Google Calendar, etc.)

## Capabilities

### New Capabilities
- `user-registration`: User onboarding — username + country collection, Turso persistence
- `task-nlp`: Natural language task parsing — date/time/description from free text
- `task-crud`: Task creation with reminder config (1d/3h/1h/exact, combinable)
- `project-management`: Project tracking with completed/pending tasks, priority, periodic reminders
- `image-reminder`: Image → OCR (tesseract.js) → extracted text → reminder
- `audio-reminder`: Audio → Groq whisper-large-v3 transcription (≤20s) → reminder

### Modified Capabilities
- None

## Approach

1. **RememberAllFeature** (BotFeature impl) in `features/remember-all/` — wraps controllers + wiring, registers menu entry and text alias ("recordar")
2. **Controllers** (state machine + waiting contexts): `RegistrationController` (collect username → country), `TaskController` (NLP parse → confirm → reminder config → persist)
3. **Application layer**: `UserRegistrationService` (DB write), `NLPTaskParser` (regex/heuristic date extraction), `TaskService` (CRUD + scheduler), `AudioService` (Groq client), `OcrService` (tesseract.js worker)
4. **Infrastructure**: new Drizzle schemas in `packages/db-core/src/` (users, tasks, projects, reminders), Supabase Storage client for media
5. **Env vars**: `AUDIO_GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TZ` (for cron)
6. **Registration check** in `MessageHandler` — before routing, check if sender is registered; if not, auto-prompt registration

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/interface/whatsapp/features/remember-all/` | New | RememberAllFeature, RegistrationController, TaskController |
| `src/application/services/UserRegistrationService.ts` | New | User persistence, duplicate check |
| `src/application/services/TaskService.ts` | New | Task CRUD + scheduler registration |
| `src/application/services/AudioService.ts` | New | Groq API transcription client |
| `src/application/services/OcrService.ts` | New | Tesseract.js OCR processing |
| `src/application/services/NLPTaskParser.ts` | New | Spanish NLP date/time extraction |
| `packages/db-core/src/schema/` | New | Drizzle schemas: users, tasks, projects, reminders |
| `src/infrastructure/config/env.ts` | Modified | +AUDIO_GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, TZ |
| `src/infrastructure/storage/` | New | Supabase Storage adapter for images/audio |
| `src/interface/whatsapp/MessageHandler.ts` | Modified | Registration gate before routing |
| `src/main.ts` | Modified | RememberAllFeature registration, cron init |
| `package.json` | Modified | +tesseract.js, groq-sdk, @supabase/supabase-js, node-cron |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Groq API key exposure | Low | `.env` pattern, key never logged |
| Large images blow OCR cost | Med | Max file size (1MB), skip OCR if no text region detected |
| Audio >20s rejected silently | Low | Hard reject with error message, warn at 15s |
| Cron miss after process restart | Low | Scheduler state in-memory; tasks re-register on startup from DB |
| tesseract.js memory on Raspberry Pi | Med | Single worker, dispose after each job, limit to 1 concurrent |

## Rollback Plan

1. Remove `RememberAllFeature` from features array in `main.ts`
2. Revert `MessageHandler.ts` — remove registration gate
3. Remove env vars from `env.ts`
4. Delete `features/remember-all/`, `services/*Service.ts`, `infrastructure/storage/`
5. Drop new DB tables (users, tasks, projects, reminders)
6. Remove new npm deps, run `pnpm install`

## Dependencies

- Groq API key (user must create account)
- Supabase project + storage bucket (user must create)
- `tesseract.js` (MIT, bundled)
- `groq-sdk` (BSD-2, bundled)
- `node-cron` (MIT, already in stack)

## Success Criteria

- [ ] First-time user sees registration prompt → enters username + country → persisted in DB
- [ ] Registered user types "El martes debo hacer X a las 5pm" → task parsed, reminder config collected, persisted
- [ ] User attaches image → OCR extracts text → reminder fires at scheduled time with image
- [ ] User sends audio ≤15s → transcribed via Groq → reminder created
- [ ] Audio >20s rejected with error message
- [ ] User queries "¿Qué proyectos tengo pendientes?" → sorted by priority
- [ ] `tsc --noEmit` passes with zero errors
