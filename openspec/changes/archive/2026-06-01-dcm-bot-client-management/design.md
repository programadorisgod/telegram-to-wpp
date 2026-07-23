# Design: DCM bot — Gestión de clientes de confección

## Technical Approach

Puerto/adaptador hexagonal idéntico al patrón existente (`ITaskRepository` → `TaskRepository` → use cases → `TaskController`). Se reemplaza la capa de persistencia local (Turso/Drizzle) por un adaptador HTTP que consume la API REST de confección con `fetch` nativo. El state machine y el MessageHandler se actualizan para los nuevos flujos de cliente, y se elimina TODO el código legacy de Task/Schedule/Reminder.

## Architecture Decisions

| Decisión | Opciones | Tradeoff | Elección |
|----------|----------|----------|----------|
| Conexión API | Fetch directo en controller vs puerto hexagonal | Fetch directo: menos archivos, no testeable, rompe patrón existente. Puerto: sigue el patrón del proyecto, testeable, desacoplado | **Puerto `IClientApi` + adaptador `ClientApiAdapter`** |
| HTTP client | `axios` vs `native fetch` | Axios: dependencia extra, API más verbosa. Fetch nativo: disponible en Node >=20, zero-dependency | **`native fetch`** |
| Entidad Client | Plain class (como Task) vs Zod schema | Clase sola: consistente con Task existente pero _id mapping frágil. Zod: validación runtime de medidas + parseo de API | **Clase `Client` + Zod schema para validación de medidas** |
| MongoDB `_id` | Propagar `_id` a toda la app vs mapear en adapter | Propagar `_id`: rompe convención de `id` en dominio. Mapear: el adapter traduce `_id` → `id` al entrar y `id` → `_id` al salir | **Mapeo exclusivo en `ClientApiAdapter`** |
| State machine contexts | Reusar `waiting_task_*` vs nuevos `waiting_client_*` | Reusar: confuso semánticamente. Nuevos: claros, auto-documentados | **Nuevos `waiting_client_*`** |
| Código legacy | Mantener muerto vs eliminar | Mantener: compila pero confunde. Eliminar: requiere commit previo para rollback seguro | **Eliminar todo** (Task, Schedule, Reminder, repos, schema, scheduler) |

## Data Flow

```
WhatsApp ──→ MessageHandler.handle(text, sender)
                  │
                  ├── routeCommand("1".."1.5", "ayuda", "0")
                  │         └── DCMController.startCreation|showAll|etc.
                  │
                  └── handleWaiting (state.context startsWith "waiting_client_")
                            └── DCMController.handleWaiting
                                      │
                                      ▼
                              Use Case (Create|List|Get|Update|Delete)
                                      │
                                      ▼
                              IClientApi (port)
                                      │
                                      ▼
                              ClientApiAdapter (native fetch)
                                      │
                                      ▼
                              http://localhost:4000/api/v1/users/*
```

**Create flow (sequence):**
```
User       DCMController    CreateClient     IClientApi     ClientApiAdapter    API
  │              │               │               │                │              │
  ├─ name ──────►               │               │                │              │
  ├─ email ─────►  (accumulates │               │                │              │
  ├─ phone ─────►   in state)   │               │                │              │
  ├─ measures ──►               │               │                │              │
  │              ├──execute()──►│               │                │              │
  │              │              ├──create()────►│                │              │
  │              │              │               ├──fetch POST────►              │
  │              │              │               │                ├──POST /create►
  │              │              │               │                ◄──{ newUser }─┤
  │              │              │               ◄──Client entity ─┘              │
  │ ◄──"Creado" ─┤              │               │                │              │
```

## State Machine Design

```
main
└── clients (submenu)
    ├── waiting_client_name     → crear (paso 1)
    ├── waiting_client_email    → crear (paso 2)
    ├── waiting_client_phone    → crear (paso 3)
    ├── waiting_client_measures → crear (paso 4)
    ├── waiting_client_select   → detail / update / delete (elegir de lista)
    ├── waiting_client_update_field  → update (elegir campo)
    ├── waiting_client_update_value  → update (nuevo valor)
    └── waiting_client_confirm_delete → delete (confirmar)
```

Tipo `UserContext` actualizado: se reemplazan todos los `waiting_task_*` / `waiting_schedule_*` por los `waiting_client_*` de arriba. Se mantiene `'main'` y se agrega `'clients'`.

## File Changes

### New files (9)

| File | Description |
|------|-------------|
| `src/domain/entities/Client.ts` | Entidad Client: id, name, email, phone, medidas (Record<string, number>), createdAt, updatedAt |
| `src/domain/value-objects/MeasurementType.ts` | Enum/const con las 12 medidas: sigla, nombre español, rango válido |
| `src/application/ports/IClientApi.ts` | Puerto: `list()`, `getById(id)`, `create(dto)`, `update(id, dto)`, `delete(id)` |
| `src/application/use-cases/clients/CreateClient.ts` | Valida DTO con Zod, llama a `IClientApi.create()` |
| `src/application/use-cases/clients/ListClients.ts` | Llama a `IClientApi.list()`, retorna array |
| `src/application/use-cases/clients/GetClient.ts` | Llama a `IClientApi.getById(id)` |
| `src/application/use-cases/clients/UpdateClient.ts` | Llama a `IClientApi.update(id, dto)` |
| `src/application/use-cases/clients/DeleteClient.ts` | Llama a `IClientApi.delete(id)` |
| `src/infrastructure/http/ClientApiAdapter.ts` | Implementa `IClientApi` con `native fetch`. Mapea `_id` ↔ `id`. Parsea respuestas anidadas (`{ user }`, `{ users }`, `{ newUser }`, `{ userUpdated }`, `{ userDeleted }`) |
| `src/interface/whatsapp/controllers/DCMController.ts` | Maneja comandos y waiting states de clientes. Sigue exactamente el patrón de `TaskController`/`ScheduleController` |
| `src/interface/whatsapp/DCMenuService.ts` | Genera menús y formatos DCM (client list, detail con medidas, prompts) |

### Modified files (4)

| File | Changes |
|------|---------|
| `src/main.ts` | Eliminar imports/instancias de TaskRepository, ScheduleController, ReminderScheduler, db. Agregar wiring de ClientApiAdapter, use cases, DCMController. Eliminar `reminderScheduler.start()` |
| `src/interface/whatsapp/MessageHandler.ts` | Reemplazar routing de tasks/schedules por clients. Delegar `handleWaiting` a `DCMController` |
| `src/interface/whatsapp/ConversationStateMachine.ts` | Reemplazar tipos `UserContext`: eliminar `waiting_task_*` / `waiting_schedule_*`, agregar `waiting_client_*` |
| `src/infrastructure/config/env.ts` | Agregar `API_BASE_URL` (Zod string default `http://localhost:4000/api/v1/users`). Remover `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |

### Deleted files (20)

| File | Reason |
|------|--------|
| `src/domain/entities/Task.ts` | Legacy — reemplazado por Client |
| `src/domain/entities/Schedule.ts` | Legacy |
| `src/domain/entities/Reminder.ts` | Legacy |
| `src/domain/value-objects/TaskStatus.ts` | Legacy |
| `src/domain/value-objects/DayOfWeek.ts` | Legacy |
| `src/application/ports/ITaskRepository.ts` | Legacy |
| `src/application/ports/IScheduleRepository.ts` | Legacy |
| `src/application/ports/IReminderRepository.ts` | Legacy |
| `src/application/use-cases/tasks/*.ts` (4) | Legacy |
| `src/application/use-cases/schedules/*.ts` (3) | Legacy |
| `src/application/use-cases/reminders/*.ts` (2) | Legacy |
| `src/infrastructure/database/repositories/*.ts` (3) | Legacy — ya no hay DB local |
| `src/infrastructure/database/schema.ts` | Legacy |
| `src/infrastructure/database/migrate.ts` | Legacy |
| `src/infrastructure/database/index.ts` | Legacy — ya no se usa `db-core` |
| `src/infrastructure/scheduler/ReminderScheduler.ts` | Legacy |
| `src/interface/whatsapp/controllers/TaskController.ts` | Legacy |
| `src/interface/whatsapp/controllers/ScheduleController.ts` | Legacy |

## Interfaces / Contracts

```typescript
// IClientApi.ts
interface IClientApi {
  list(): Promise<Client[]>;
  getById(id: string): Promise<Client>;
  create(dto: CreateClientDTO): Promise<Client>;
  update(id: string, dto: Partial<CreateClientDTO>): Promise<Client>;
  delete(id: string): Promise<void>;
}

// Zod schema for measurement validation (in Client.ts or MeasurementType.ts)
const measurementsSchema = z.object({
  AE: z.number().min(10).max(200),
  TD: z.number().min(10).max(200),
  TE: z.number().min(10).max(200),
  CP: z.number().min(10).max(200),
  ALB: z.number().min(5).max(100),
  SB: z.number().min(5).max(100),
  CC: z.number().min(10).max(200),
  CK: z.number().min(10).max(200),
  ALK: z.number().min(5).max(100),
  LT: z.number().min(50).max(250),
  LM: z.number().min(10).max(150),
  LSH: z.number().min(5).max(100),
});
```

## API Response Mapping

| Endpoint | Response wrapper | Mapping en adapter |
|----------|-----------------|-------------------|
| `GET /users` | `{ users: [...] }` | `_id` → `id`, extract `users` array |
| `GET /users/:id` | `{ user: {...} }` | `_id` → `id`, extract `user` |
| `POST /users/create` | `{ newUser: {...} }` | `_id` → `id`, extract `newUser` |
| `PATCH /users/update/:id` | `{ userUpdated: {...} }` | `_id` → `id`, extract `userUpdated` |
| `DELETE /users/delete/:id` | `{ userDeleted: {...} }` | Return void on 2xx |

## Testing Strategy

No test runner disponible actualmente (detectado en SDD Init). La estrategia es:

| Capa | Qué probar | Cómo |
|------|-----------|------|
| Manual | Flujo completo WhatsApp | Smoke test contra API real tras el wiring |
| Adapter (futuro) | Mapeo `_id`, parseo de respuestas, errores HTTP | Configurar test runner + mock de `fetch` global |
| Controller (futuro) | Handlers de waiting states | Mock `IClientApi`, verificar respuestas |

## Migration / Rollout

1. Commit actual antes de empezar (baseline para rollback)
2. Crear archivos nuevos (entity, VO, port, adapter, use cases, controller, menu service)
3. Modificar `env.ts` (agregar `API_BASE_URL`)
4. Modificar `ConversationStateMachine.ts` (tipos)
5. Modificar `MessageHandler.ts` (routing)
6. Modificar `main.ts` (wiring)
7. Eliminar archivos legacy
8. `tsc --noEmit` para verificar que no quedan imports rotos
9. Smoke test con WhatsApp real

Rollback: `git checkout main -- src/` + revertir `env.ts`.

## Open Questions

- [ ] Rango numérico exacto para cada medida (ej. AE min/max) — defino valores conservadores por ahora, se ajustan en testing

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API response wrapper cambia (ej. `{ data }` en vez de `{ user }`) | Baja | Adapter centraliza el parseo; un solo punto de cambio |
| `db-core` package queda como dependencia huérfana en el monorepo | Alta | Se deja intencionalmente (out of scope); no afecta runtime |
| Sin tests, errores de mapping se detectan tarde | Media | Smoke test manual temprano + validación Zod en adapter ante fallos de parseo |
