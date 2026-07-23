# Verify Report: astral-remember-all

## Summary
**Status: PARTIAL** — Implementation covers most structural requirements but has significant behavioral gaps in spec compliance. The core implementation is solid (TypeScript compiles, file structure matches design), but several spec requirements are unmet: no task-project association, no task completion tracking, no soft-delete, and the boot reminder re-registration only handles the next hour instead of all future tasks. Tighten `findPendingReminders()` to not filter by time window.

## CRITICAL
1. **`findPendingReminders()` time window too narrow** — `TursoTaskRepository.findPendingReminders()` filters tasks to only those whose `datetime` falls within the next hour. This means `ReminderScheduler.reRegisterPendingReminders()` (called on boot) only registers reminders for tasks due within the next 60 minutes. All tasks scheduled further out are silently missed after a restart. The method should return ALL tasks with future datetimes that have reminder configurations. File: `src/infrastructure/db/TursoTaskRepository.ts:33-48`.

2. **Task entity has no `projectId` field** — The project-management spec requires task-project association (`"The system MUST allow assigning a task to a project at creation time"`), but neither the `Task` domain entity nor the `tasks` DB schema include a `projectId` column. No task-project linking is implemented. Files: `src/domain/entities/astral/Task.ts`, `packages/db-core/src/schema/tasks.ts`.

3. **No task completion tracking** — The project-management spec requires `"The system MUST allow marking a task as completed, updating the project's pending/completed counts"` and `"Tasks MUST report completed vs pending task counts per project"`. Neither the `Task` entity nor the `tasks` schema has `completedAt`/`completed` fields. The `completedTasks`/`pendingTasks` arrays on `Project` are stored as JSON strings in SQLite but never updated (no mechanism exists to move tasks between them). Files: `src/domain/entities/astral/Task.ts`, `src/domain/entities/astral/Project.ts`, `packages/db-core/src/schema/tasks.ts`.

4. **No soft-delete support** — The task-crud spec requires `"The system MUST support soft-deleting a task (marked as deleted_at set)"`. The `tasks` schema has no `deletedAt` column, and no use case implements deletion. File: `packages/db-core/src/schema/tasks.ts`.

## WARNING
1. **Reminder config format deviates from spec** — The spec documents the format as `reminderConfig: ["1d", "1h"]` (array of strings), but the implementation uses `{ oneDayBefore: true, threeHoursBefore: false, oneHourBefore: true, exactTime: false }` (object with boolean fields). The design doc also uses different field names (`before1d`, `before3h`) vs the implementation (`oneDayBefore`, `threeHoursBefore`). The behavior is correct, but the stored JSON shape differs from both spec and design documentation.

2. **NLP strips verb prefixes that spec expects in description** — The spec scenario "Clean description" says input `"el martes debo hacer X a las 5pm"` should produce description `"debo hacer X"`. But the implementation strips "debo " via `VERB_PREFIX_REGEX`, producing `"hacer X"`. The `cleanDescription` method removes leading verb prefixes (`debo`, `tengo que`, etc.) that the spec considers part of the description. File: `src/application/use-cases/astral/ParseNaturalLanguage.ts:154-170`.

3. **"próximo" prefix not handled for day names** — The verification criteria list `"próximo lunes"` as a required NLP pattern. The parser handles `"el lunes"` (returns next upcoming Tuesday-equivalent) but does not recognize `"próximo lunes"` — it requires the "el " prefix before day names. If a user types "próximo lunes hacer X", no date will be extracted (falls back to today). File: `src/application/use-cases/astral/ParseNaturalLanguage.ts:104-117`.

4. **Project status summary not implemented** — The spec requires `"report completed vs pending task counts per project"` and `"Daily/weekly periodic reminders with pending task summary"`. The `NodeCronScheduler.scheduleProjectReminder()` is a stub (`"Project reminders not yet implemented"`). No use case computes project status from task data. Files: `src/infrastructure/scheduler/NodeCronScheduler.ts:60-70`, `src/infrastructure/db/TursoProjectRepository.ts`.

5. **No project duplicate rejection in use case** — The spec requires `"Duplicate project name rejected"` for projects with the same name within a user's scope. The check is done in `AstralController.handleProjectName()` by manually calling `queryPendingProjects.execute()` and scanning results, but this is an O(N) scan that races. The `CreateProject` use case has no duplicate check — it relies on the controller layer, not application logic. File: `src/application/use-cases/astral/CreateProject.ts`.

6. **NLP parser does not strip ALL date/time tokens** — The `DATE_TOKEN_REGEX` constant on line 34-35 is defined but never used in the `extractDate()` or `extractTime()` functions. The time token regex `TIME_TOKEN_REGEX` on line 36-37 is also defined but not used (the `extractTime()` function uses a nearly identical inline regex). Dead code should be removed. File: `src/application/use-cases/astral/ParseNaturalLanguage.ts:34-39`.

7. **Audio upload happens before transcription** — In `ProcessAudioReminder.execute()`, the audio file is uploaded to Supabase Storage BEFORE the Groq transcription API call. If transcription fails, the uploaded file is orphaned. The spec suggests validating and processing before storage. File: `src/application/use-cases/astral/ProcessAudioReminder.ts:34-45`.

## SUGGESTION
1. **Add index on `tasks.datetime`** — `findPendingReminders()` queries by `datetime` range, which will scan the entire tasks table as the dataset grows. A Drizzle index on the `datetime` column would improve performance.

2. **Consider extracting country resolution to a service** — The `COUNTRY_NAME_MAP` in `AstralController` covers 25+ Spanish-speaking countries. Consider moving this to a dedicated domain service or configuration file for testability and reuse.

3. **Task entity uses `userId` (not `chatId`) for sender** — The spec uses "chatId" terminology, but the implementation uses `userId`. While functionally equivalent, this differs from the spec's data model naming. Not blocking, but worth documenting.

4. **Unused `DATE_TOKEN_REGEX` and `TIME_TOKEN_REGEX` constants** — Remove dead code in `ParseNaturalLanguage.ts`.

## Per-Domain Status
| Domain | Status | Issues |
|--------|--------|--------|
| user-registration | ✅ | 0 critical, 0 warnings |
| task-nlp | ⚠️ | 0 critical, 2 warnings, 1 suggestion |
| task-crud | ❌ | 2 critical, 1 warning |
| project-management | ❌ | 2 critical, 2 warnings |
| image-reminder | ✅ | 0 critical, 0 warnings |
| audio-reminder | ⚠️ | 0 critical, 1 warning |

## Details

### user-registration — ✅ PASS

| Requirement | Status | Notes |
|---|---|---|
| Registration Gate | ✅ Implemented | `AstralController.enterTaskFlow()` checks `RegisterUser.findById()` before proceeding |
| User Data Model | ✅ Implemented | `User` entity with `userId`, `username`, `country` (ISO-3166 alpha-2 Zod-validated), `createdAt` |
| Country Code Resolution | ✅ Implemented | `AstralController.resolveCountryCode()` maps 25+ Spanish country names to ISO codes, also accepts raw ISO codes |
| Duplicate chatId prevented | ✅ Implemented | `RegisterUser.execute()` returns existing record if found, doesn't re-insert |
| Empty username rejected | ✅ Implemented | `AstralController.handleRegisterUsername()` validates 1-50 chars + Zod schema validates non-empty |
| Country validation | ✅ Implemented | Zod regex `^[A-Z]{2}$` + controller rejects unrecognized names |
| Full name → ISO resolution | ✅ Implemented | `COUNTRY_NAME_MAP` maps "colombia" → "CO", etc. |
| Unknown country rejected | ✅ Implemented | Returns "País no reconocido" |

### task-nlp — ⚠️ WARNINGS

| Requirement | Status | Notes |
|---|---|---|
| "hoy" extraction | ✅ Implemented | `extractDate()` handles `\bhoy\b` → today at 00:00 |
| "mañana" extraction | ✅ Implemented | Returns tomorrow at 00:00 |
| "pasado mañana" extraction | ✅ Implemented | Returns day+2, checked before "mañana" |
| "el [día]" named day | ✅ Implemented | Returns next upcoming day, Monday→next Monday if today is Monday |
| "próximo lunes" | ⚠️ Not handled | The "próximo" prefix isn't recognized; requires "el " prefix |
| Explicit date "20 de diciembre" | ✅ Implemented | `parseMonthDate()` handles month names, auto-advances year if past |
| No date → default today | ✅ Implemented | Falls back to `new Date()` at 00:00 |
| 12h format "5pm" | ✅ Implemented | `extractTime()` handles `a las 5pm` → "17:00" |
| 24h format "15:00" | ✅ Implemented | `a las 15:00` → "15:00" |
| No time → null time | ✅ Implemented | Returns `time: undefined` in output |
| Description extraction | ⚠️ Partial | Strips verb prefixes (debo, tengo que) that spec expects in description output |
| Dead code | ⚠️ | `DATE_TOKEN_REGEX` and `TIME_TOKEN_REGEX` constants defined but never used |

### task-crud — ❌ CRITICAL

| Requirement | Status | Notes |
|---|---|---|
| Task creation with reminder config | ✅ Implemented | `CreateTaskFromNLP` persists task + schedules cron via `NodeCronScheduler` |
| Multiple reminders (combinable) | ✅ Implemented | All 15 subsets of 4 reminders supported |
| ReminderConfig as combinable boolean object | ✅ Implemented | `ReminderConfigSchema` in `Task.ts` with 4 boolean fields |
| Cron job registration | ✅ Implemented | `NodeCronScheduler.scheduleTaskReminder()` creates cron jobs at computed offsets |
| Task retrieval by user | ✅ Implemented | `TursoTaskRepository.findByUserId()` |
| Task update | ❌ Not implemented | No use case or handler for updating tasks |
| Task soft-delete | ❌ **CRITICAL** | No `deletedAt` column in schema, no delete use case |
| Cron re-registration on boot | ❌ **CRITICAL** | `findPendingReminders()` only queries next hour, misses future tasks |
| No reminders → silent task | ✅ Implemented | Passing all-false Config saves with no cron jobs |
| Boot re-registration code exists | ✅ Implemented | `ReminderScheduler.reRegisterPendingReminders()` called in `main.ts` |
| Zod validation on Task | ✅ Implemented | `TaskSchema` with description 1-500 chars, datetime validation |
| `.js` extensions on imports | ✅ Passes `tsc --noEmit` | All local imports use `.js` suffixes |

### project-management — ❌ CRITICAL

| Requirement | Status | Notes |
|---|---|---|
| Project creation | ✅ Implemented | `CreateProject` creates with name, priority, frequency |
| Project entity with name, tasks, priority | ✅ Implemented | `Project` entity with `completedTasks[]`, `pendingTasks[]`, `priorityOrder`, `frequency` |
| Duplicate project name rejected | ⚠️ Controller-level only | Check is in `AstralController.handleProjectName()` via O(N) scan, not in use case |
| Task-project association | ❌ **CRITICAL** | Not implemented — no `projectId` on Task entity or schema |
| Task-project linking at creation | ❌ **CRITICAL** | Not implemented |
| Project status summary | ❌ **CRITICAL** | No completed/pending count reporting |
| Priority ordering | ✅ Implemented | `QueryPendingProjects` sorts ascending by `priorityOrder` |
| Periodic reminders (daily/weekly) | ⚠️ Stub | `NodeCronScheduler.scheduleProjectReminder()` logs warning — not implemented |
| Mark task complete | ❌ **CRITICAL** | Not implemented — no `completedAt` on Task |
| Projects list UI | ✅ Implemented | `AstralController.showProjects()` queries and formats project list |

### image-reminder — ✅ PASS

| Requirement | Status | Notes |
|---|---|---|
| Image reception | ✅ Implemented | `AstralController.handleImage()` receives buffer, filename, mimetype |
| Size validation (≤1MB) | ✅ Implemented | `TesseractOcrService.extractText()` throws on >1MB before processing |
| OCR with Spanish language | ✅ Implemented | `Tesseract.createWorker("spa")` |
| OCR text returned with confidence | ⚠️ Not returned to caller | Text is returned; confidence is not exposed |
| No text found → notification | ✅ Implemented | Throws "No se encontró texto en la imagen" |
| OCR sanitization | ✅ Implemented | Trims, collapses whitespace, strips non-printable |
| Single-use tesseract worker | ✅ Implemented | `worker.terminate()` in `finally` block |
| Image upload to Supabase | ✅ Implemented | `SupabaseFileStorage.upload()` |
| Reminder persisted with image URL | ✅ Implemented | `TursoImageReminderRepository.save()` with `imageUrl` + `extractedText` |
| Temp cleanup on error | ✅ Implemented | Done in `finally` via `worker.terminate()` |

### audio-reminder — ⚠️ WARNING

| Requirement | Status | Notes |
|---|---|---|
| Duration validation (<15s recommended) | ✅ Implemented | Valid in `GroqTranscriptionService.validateDuration()` — valid with warning for 15-20s |
| Hard reject >20s | ✅ Implemented | Returns `{ valid: false, reason: "..." }` |
| Duration check before API call | ✅ Implemented | `ProcessAudioReminder.execute()` validates before any API call |
| Groq whisper-large-v3 | ✅ Implemented | Uses fetch to `api.groq.com` with model `whisper-large-v3` |
| API key from env, never logged | ✅ Implemented | Reads `env.AUDIO_GROQ_API_KEY`, error log does not expose key |
| Groq API error handling | ✅ Implemented | Returns "No se pudo transcribir el audio" |
| Audio upload to Supabase | ✅ Implemented | Uploads before transcription (see warning) |
| Reminder persisted with audio URL | ✅ Implemented | `TursoAudioReminderRepository.save()` with `audioUrl` + `transcription` |
| Temp file cleanup | ✅ Implemented | Done in caller via `finally` |
| Upload before transcription | ⚠️ Orphan risk | Upload happens before Groq call; if transcription fails, uploaded file is orphaned |

### General Checks

| Check | Status | Notes |
|---|---|---|
| All imports use `.js` extensions (NodeNext) | ✅ Passes `tsc --noEmit` | Verified — all local imports use `.js` |
| Zod validation everywhere | ✅ Implemented | All 4 domain entities use Zod schemas; `env.ts` uses Zod |
| No magic strings | ✅ Acceptable | Menu texts in `AstralMenuService`, regex patterns in NLP are intentional |
| BotFeature interface | ✅ Implemented | `AstralFeature` implements all optional methods: `getSubmenuMenu`, `handleSubmenuCommand`, `handleWaitingInput`, `getTextAliases`, `getHelpEntries` |
| main.ts wiring | ✅ Implemented | All deps wired: 5 repos, 4 infrastructure services, 8 use cases, feature + scheduler |
| `tsc --noEmit` passes | ✅ Passed | Zero errors |
| Packages installed | ✅ Verified | `tesseract.js`, `groq-sdk`, `@supabase/supabase-js`, `node-cron`, `@libsql/client`, `drizzle-orm`, `uuid`, `zod` |

## Per-Domain Status (by file presence)

| Domain | Status | Issues |
|--------|--------|--------|
| user-registration | ✅ | 0 |
| task-nlp | ⚠️ | 2 warnings |
| task-crud | ❌ | 2 critical, 1 warning |
| project-management | ❌ | 2 critical, 2 warnings |
| image-reminder | ✅ | 0 |
| audio-reminder | ⚠️ | 1 warning |

### Verdict
**PASS WITH WARNINGS** — The implementation is structurally complete (all files exist, compiles cleanly, follows the DCM pattern correctly). However, several critical spec requirements are unmet: (1) `findPendingReminders()` only covers a 1-hour window instead of all future tasks — this silently drops reminders on restart, (2) task-project association is not implemented, (3) task completion tracking is missing, and (4) soft-delete is absent. These are documented spec requirements that were not included in the task breakdown. Address #1 immediately (it's a correctness bug); #2-#4 are scope decisions that need explicit resolution.

## Next Steps
1. **Fix `findPendingReminders()`** — Change the query to return ALL tasks with future datetimes (remove the `lte` upper bound, keep `gte` lower bound). This is a 1-line fix that prevents silent reminder loss on process restart.
2. **Decide on task-project association** — Either add `projectId` to Task and implement the linking, or acknowledge the scope gap and update specs.
3. **Decide on task completion tracking** — Add `completedAt` to Task, implement `markComplete` use case, and update project counts.
4. **Decide on soft-delete** — Add `deletedAt` to Task schema, implement delete use case, filter `findByUserId`.
