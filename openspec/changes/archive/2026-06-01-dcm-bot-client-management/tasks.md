# Tasks: DCM bot — Gestión de clientes de confección

## Phase 1: Foundation — Entity, Port, Config

- [x] 1.1 Create `src/domain/entities/Client.ts` — class + Zod validation, uses ClientMeasures value object for the 12 measures
- [x] 1.2 Create `src/domain/value-objects/ClientMeasures.ts` — value object with Zod schema (all 12 measures: AE, TD, TE, CP, ALB, SB, CC, CK, ALK, LT, LM, LSH), toJSON/fromJSON
- [x] 1.3 Create `src/application/ports/IClientApi.ts` — interface: `create(dto)`, `findAll()`, `findById(id)`, `update(id, dto)`, `delete(id)`; DTOs: CreateClientDTO, UpdateClientDTO
- [x] 1.4 Modify `src/infrastructure/config/env.ts` — add `API_BASE_URL` (default `http://localhost:4000/api/v1/users`). TURSO vars removal deferred to Phase 4.
- [x] 1.5 Modify `src/interface/whatsapp/ConversationStateMachine.ts` — add `'clients'` + 8 `waiting_client_*` states. Existing states kept for now (removal deferred to Phase 4).

## Phase 2: Adapter & Use Cases

- [x] 2.1 Create `src/infrastructure/http/ClientApiAdapter.ts` — implements `IClientApi` with native fetch; maps `_id`↔`id`; parses `{user}`, `{users}`, `{newUser}`, `{userUpdated}`, `{userDeleted}` wrappers
- [x] 2.2 Create `src/application/use-cases/clients/CreateClient.ts` — validates DTO with Zod, calls `IClientApi.create()`
- [x] 2.3 Create `src/application/use-cases/clients/ListClients.ts` — calls `IClientApi.list()`
- [x] 2.4 Create `src/application/use-cases/clients/GetClient.ts` — calls `IClientApi.getById()`
- [x] 2.5 Create `src/application/use-cases/clients/UpdateClient.ts` — calls `IClientApi.update()`
- [x] 2.6 Create `src/application/use-cases/clients/DeleteClient.ts` — calls `IClientApi.delete()`

## Phase 3: Interface — WhatsApp Menus & Controller

- [x] 3.1 Create `src/interface/whatsapp/DCMenuService.ts` — menu builders: client submenu (opts 1.1-1.5), create flow prompts (name→email→phone→measures), client list/detail format with Spanish measurement labels, success/error messages
- [x] 3.2 Create `src/interface/whatsapp/controllers/DCMController.ts` — command methods (startCreation, showAll, showDetail, promptUpdate, promptDelete) + `handleWaiting` for all 8 `waiting_client_*` states; validates measures with Zod; manages state transitions

## Phase 4: Wiring & Cleanup

- [x] 4.1 Modify `src/interface/whatsapp/MessageHandler.ts` — replace TaskController/ScheduleController imports with DCMController; route `1`→DCM submenu, `1.1-1.5`→DCM actions; delegate waiting states to DCMController
- [x] 4.2 Modify `src/main.ts` — remove all legacy wiring (TaskRepository, ScheduleRepository, ReminderRepository, ReminderScheduler, TaskController, ScheduleController); wire ClientApiAdapter, 5 use cases, DCMController; remove `reminderScheduler.start()`
- [x] 4.3 Delete legacy (~20 files): entities (Task, Schedule, Reminder), VOs (TaskStatus, DayOfWeek), ports (ITaskRepository, IScheduleRepository, IReminderRepository), use-cases (tasks/, schedules/, reminders/), database (schema.ts, migrate.ts, index.ts, repositories/), scheduler (ReminderScheduler.ts), controllers (TaskController, ScheduleController)
- [x] 4.4 Run `tsc --noEmit` — verify zero type/import errors
- [ ] 4.5 Smoke test against real API — full create/list/detail/update/delete cycle via WhatsApp
