# Tasks: Performance Audit & Memory Leaks Fix

## Phase 1: Foundation (Config, Logger, Types)

- [ ] 1.1 Add new env vars to `src/infrastructure/config/env.ts`: `LOG_LEVEL`, `GROQ_TIMEOUT_MS`, `SUPABASE_TIMEOUT_MS`, `AI_TIMEOUT_MS`, `TTL_CACHE_USER_STATES`, `TTL_CACHE_SESSIONS`, `TTL_CACHE_MESSAGES`, `NLP_CACHE_TTL_MS`, `NLP_CACHE_MAX_SIZE`, `TESSERACT_POOL_SIZE`, `REMINDER_REGISTRATION_CHUNK_SIZE`, `MAX_MEDIA_SIZE_MB`
- [ ] 1.2 Create `src/infrastructure/logger.ts`: Pino logger factory with levels (info/warn/error/debug), child loggers, and JSON structured output
- [ ] 1.3 Create `src/infrastructure/utils/ttl-cache.ts`: Generic `TTLCache<K,V>` class with `get/set/has/delete/cleanup/stats` methods, LRU eviction, and configurable TTL
- [ ] 1.4 Create `src/infrastructure/db/schema/user_states.ts`: Drizzle schema for `user_states` table (userId PK, context, data JSON, updatedAt)
- [ ] 1.5 Run `pnpm db:generate` and `pnpm db:push` to apply the new schema to Turso

## Phase 2: Memory Leak Fixes (Bloque 1)

- [ ] 2.1 Modify `src/interface/whatsapp/ConversationStateMachine.ts`: Replace raw Map with TTLCache, add lazy cleanup on `getState`/`setState`, set default TTL 30min
- [ ] 2.2 Modify `packages/whatsapp-core/src/client/BaileysClient.ts`: Replace processedMessageIds Set with TTLCache (5min), replace recentBodies/recentSends/sentMessages Maps with TTLCache, remove array-slicing trim logic
- [ ] 2.3 Modify `src/application/services/TelegramBridgeService.ts`: Add TTL to activeSessions Set (15min), add zombie cleanup on `sendToWhatsApp`/`sendMediaToWhatsApp`
- [ ] 2.4 Modify `src/infrastructure/scheduler/NodeCronScheduler.ts`: Wrap timeout callback body in try/finally to ensure job entry cleanup even on error

## Phase 3: API Timeouts (Bloque 3)

- [ ] 3.1 Modify `src/infrastructure/transcription/GroqTranscriptionService.ts`: Add AbortController with timeout from `GROQ_TIMEOUT_MS` env var, catch AbortError and throw user-friendly timeout message
- [ ] 3.2 Modify `src/infrastructure/storage/SupabaseFileStorage.ts`: Add AbortController with timeout from `SUPABASE_TIMEOUT_MS` env var to all fetch calls (verifyBucket, upload, delete, getSignedUrl)
- [ ] 3.3 Modify `packages/ai-core/src/providers/MidAIProvider.ts`: Add timeout wrapper around MidAI chat calls using `AI_TIMEOUT_MS` env var

## Phase 4: Structured Logging (Bloque 4)

- [ ] 4.1 Replace all `console.log`/`console.error`/`console.warn` in `src/main.ts` with pino logger equivalents
- [ ] 4.2 Replace all console calls in `src/interface/whatsapp/MessageHandler.ts` with logger
- [ ] 4.3 Replace all console calls in `packages/whatsapp-core/src/client/BaileysClient.ts` with logger
- [ ] 4.4 Replace all console calls in `src/infrastructure/scheduler/NodeCronScheduler.ts` with logger
- [ ] 4.5 Replace all console calls in `src/application/use-cases/astral/ReminderScheduler.ts` with logger
- [ ] 4.6 Replace all console calls in `src/infrastructure/storage/SupabaseFileStorage.ts` with logger
- [ ] 4.7 Replace all console calls in `src/infrastructure/transcription/GroqTranscriptionService.ts` with logger
- [ ] 4.8 Replace all console calls in `src/interface/whatsapp/features/astral/AstralController.ts` with logger
- [ ] 4.9 Replace all console calls in remaining src/ files (DCMController, DCMenuService, TelegramBridgeService, OCR, etc.) with logger

## Phase 5: Controller Split (Bloque 2)

- [ ] 5.1 Create `src/interface/whatsapp/features/astral/RegistrationController.ts`: Extract registration flow methods (startRegistration, handleRegisterConfirm, handleRegisterUsername, handleRegisterCountry)
- [ ] 5.2 Create `src/interface/whatsapp/features/astral/TaskController.ts`: Extract task flow methods (enterTaskFlow, handleRawTask, showTaskConfirmation, handleTaskConfirm, handleTaskTime, handleReminderConfig, handleFrequency*, enterEditTaskFlow, handleTaskEdit*, showTasksList)
- [ ] 5.3 Create `src/interface/whatsapp/features/astral/NoteController.ts`: Extract note flow methods (startCreateNote, handleNoteTitle, handleNoteContent, handleNoteImage*, showNotesMenu, showNotesList, handleNoteView*, startUpdateNote, handleNoteUpdate*, handleNoteNlp*)
- [ ] 5.4 Create `src/interface/whatsapp/features/astral/ProjectController.ts`: Extract project flow methods (startCreateProject, showProjects, handleProject*, startUpdateProject, handleProjectUpdate*, showProjectMenu)
- [ ] 5.5 Create `src/interface/whatsapp/features/astral/AudioController.ts`: Extract audio flow methods (handleAudio, handleAudioConfirm, handleAudioEdit)
- [ ] 5.6 Modify `src/interface/whatsapp/features/astral/AstralController.ts`: Replace extracted methods with delegation to sub-controllers, keep only routing/common utilities (findTaskByHint, findProjectByHint, normalizeMatch)
- [ ] 5.7 Modify `src/interface/whatsapp/features/astral/AstralFeature.ts`: Update constructor to pass dependencies to sub-controllers, verify all submenu commands still route correctly

## Phase 6: NLP Cache (Bloque 7)

- [ ] 6.1 Modify `src/application/use-cases/astral/TimeParserService.ts`: Wrap `execute()` method with TTLCache (key = sha256(text) + ":" + country), add `getCacheStats()` method, use `NLP_CACHE_TTL_MS` and `NLP_CACHE_MAX_SIZE` env vars

## Phase 7: Tesseract Pool (Bloque 8)

- [ ] 7.1 Modify `src/infrastructure/ocr/TesseractOcrService.ts`: Replace create/destroy per call with worker pool (configurable size via `TESSERACT_POOL_SIZE`), add health check before use, add graceful shutdown method

## Phase 8: contactsCache TTL (Bloque 9)

- [ ] 8.1 Modify `packages/whatsapp-core/src/client/BaileysClient.ts`: Add expiration timestamp to contactsCache, invalidate after 5 minutes, re-fetch on next searchContacts call

## Phase 9: Parallel Reminders (Bloque 10)

- [ ] 9.1 Modify `src/application/use-cases/astral/ReminderScheduler.ts`: Replace sequential for-await loop with chunked Promise.allSettled, use `REMINDER_REGISTRATION_CHUNK_SIZE` env var, add progress logging

## Phase 10: DB Connection Pool (Bloque 6)

- [ ] 10.1 Modify `packages/db-core/src/factory.ts`: Add `concurrency` option to libsql createClient call (default 10), read from env var or use sensible default

## Phase 11: Persistent State Machine (Bloque 11)

- [ ] 11.1 Create `src/infrastructure/db/TursoUserStateRepository.ts`: Repository with save(userId, context, data), loadAll(), deleteStale(beforeDate) methods
- [ ] 11.2 Modify `src/interface/whatsapp/ConversationStateMachine.ts`: Add async `persistState(userId)` method (fire-and-forget), add `loadFromDB()` method called on init, add stale cleanup on load
- [ ] 11.3 Modify `src/main.ts`: Wire TursoUserStateRepository to ConversationStateMachine, call loadFromDB() during startup

## Phase 12: Verification

- [ ] 12.1 Run `tsc --noEmit` and fix any type errors
- [ ] 12.2 Manually test: register user, create task, create note, create project, send audio, verify all flows work
- [ ] 12.3 Verify: kill process mid-conversation, restart, verify state is restored
- [ ] 12.4 Verify: send same NLP message twice, second response is instant (cache hit)
- [ ] 12.5 Verify: add 50 tasks to DB, restart, measure re-registration time < 2s
- [ ] 12.6 Run `eslint src --ext .ts` and fix any lint errors
