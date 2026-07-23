# Proposal: DCM bot - Gestión de clientes de confección

## Intent

Replace the current tasks/schedules WhatsApp bot with a clothing measurements (DCM) client management bot. The bot manages tailoring clients via a REST API, collecting 12 body measurements per client for garment-making.

## Scope

### In Scope
- Client entity + measurement value objects (domain layer)
- `IClientApi` port + `ClientApiAdapter` (native fetch) — hexagonal pattern
- CRUD use cases: Create, List, Get, Update, Delete
- WhatsApp controller with step-by-step conversation flows
- State machine states for client creation, selection, update, delete confirmation
- DCM-specific menu service
- Remove all old Task/Schedule/Reminder code
- Wire everything in `main.ts`

### Out of Scope
- Auth/authorization to the REST API
- Local database for client data (uses API exclusively)
- Bulk import/export
- Web UI or admin dashboard

## Capabilities

### New Capabilities
- `client-management`: CRUD de clientes de confección vía WhatsApp, incluyendo registro paso a paso con nombre, email, teléfono y 12 medidas corporales (AE, TD, TE, CP, ALB, SB, CC, CK, ALK, LT, LM, LSH)

### Modified Capabilities
- None — no existing specs in `openspec/specs/`

## Approach

Port/adapter hexagonal (Approach B from exploration). `IClientApi` port → `ClientApiAdapter` (native fetch) → use cases → `DCMController`. Identical pattern to the existing `ITaskRepository`/`TaskRepository`/`TaskController` architecture. All 12 measures collected in a single message; controller validates format before sending to API.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/domain/entities/` | New + Removed | Add `Client.ts`; remove `Task.ts`, `Schedule.ts` |
| `src/domain/value-objects/` | New + Removed | Add `MeasurementType.ts`; remove `TaskStatus.ts`, `DayOfWeek.ts` |
| `src/application/ports/` | New + Removed | Add `IClientApi.ts`; remove `ITaskRepository`, `IScheduleRepository`, `IReminderRepository` |
| `src/application/use-cases/` | New + Removed | Add `clients/`; remove `tasks/`, `schedules/`, `reminders/` |
| `src/infrastructure/http/` | New | `ClientApiAdapter.ts` |
| `src/infrastructure/database/` | Modified | Remove repositories/; keep schema.ts partial |
| `src/infrastructure/scheduler/` | Removed | Drop `ReminderScheduler.ts` |
| `src/interface/whatsapp/` | New + Modified | Add `DCMController.ts`, `DCMenuService.ts`; update `MessageHandler.ts`, `ConversationStateMachine.ts` |
| `src/main.ts` | Modified | Replace wiring |
| `src/infrastructure/config/env.ts` | Modified | Add `API_BASE_URL` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API response format mismatch (wrapped `{ user }`, MongoDB `_id`) | Med | Adapter handles mapping; test against real API early |
| User skips measures or sends wrong format | Med | Validate in controller; reject + re-prompt |
| No test runner — regression risk | High | Manual smoke test after wiring; test runner setup as separate task |
| Deleting old code breaks imports | Med | Remove only after new code is wired; commit before deletions |

## Rollback Plan

1. `git checkout main -- src/` — restores all original files
2. Revert `env.ts` changes
3. If any database schema changes, restore via `git checkout main -- src/infrastructure/database/`

## Dependencies

- API-REST-TYPESCRIPT running at `http://localhost:4000` with MongoDB/Mongoose

## Success Criteria

- [ ] WhatsApp bot responds with the DCM menu ("👗 Asistente de Confección")
- [ ] Can create a client step by step: name → email → phone → 12 measures
- [ ] Can list all clients, view detail, update fields, and delete with confirmation
- [ ] Invalid measure input is rejected with clear re-prompt
- [ ] All old Task/Schedule/Reminder code removed (no dead imports)
