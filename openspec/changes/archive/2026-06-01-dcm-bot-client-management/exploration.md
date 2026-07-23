## Exploration: DCM bot - gestión de clientes de confección

### Current State

El proyecto **tasks-bot** es un monorepo Node.js + TypeScript + pnpm con arquitectura Screaming Architecture / puertos y adaptadores:

- **WhatsApp**: Baileys (via `whatsapp-core` package) con MessageHandler central
- **DB**: Turso SQLite via Drizzle ORM (via `db-core` package)
- **DI**: Manual constructor injection en `src/main.ts`
- **Controladores actuales**: `TaskController`, `ScheduleController` — manejan menús, estados de conversación, y delegan a use cases
- **Use cases**: Capa de aplicación con ports (`ITaskRepository`, `IScheduleRepository`) y adapters concretos
- **State machine**: `ConversationStateMachine` con estados tipo `waiting_task_*`, `waiting_schedule_*`
- **Menús**: `MenuService` genera strings formateados para WhatsApp

**API REST a consumir** (API-REST-TYPESCRIPT, Express + MongoDB/Mongoose):
- Base: `http://localhost:4000/api/v1/users`
- CRUD completo de clientes con 12 medidas de confección
- Respuestas envueltas: `{ user }`, `{ users }`, `{ newUser }`, `{ userUpdated }`, `{ userDeleted }`
- Medidas: AE, TD, TE, CP, ALB, SB, CC, CK, ALK, LT, LM, LSH (todas number, required)

### Affected Areas

**NUEVOS archivos (crear):**

- `src/domain/entities/Client.ts` — Entidad Cliente con medidas
- `src/domain/value-objects/MeasurementType.ts` — Enum/objeto con las 12 medidas y metadata
- `src/application/ports/IClientApi.ts` — Puerto para el API HTTP
- `src/application/use-cases/clients/CreateClient.ts` — Use case
- `src/application/use-cases/clients/ListClients.ts` — Use case
- `src/application/use-cases/clients/GetClient.ts` — Use case
- `src/application/use-cases/clients/UpdateClient.ts` — Use case
- `src/application/use-cases/clients/DeleteClient.ts` — Use case
- `src/infrastructure/http/ClientApiAdapter.ts` — Adaptador fetch para el API REST
- `src/interface/whatsapp/controllers/DCMController.ts` — Controlador WhatsApp
- `src/interface/whatsapp/DCMenuService.ts` — Menús específicos DCM

**ARCHIVOS a modificar:**

- `src/main.ts` — Reemplazar wiring de Task/Schedule por DCM
- `src/interface/whatsapp/MessageHandler.ts` — Reemplazar routing de tareas/horarios por clientes DCM
- `src/interface/whatsapp/ConversationStateMachine.ts` — Nuevos estados `waiting_client_*`
- `src/infrastructure/config/env.ts` — Agregar `API_BASE_URL`

**ARCHIVOS a ELIMINAR (ya no aplican):**

- `src/domain/entities/Task.ts`, `Schedule.ts`
- `src/domain/value-objects/TaskStatus.ts`, `DayOfWeek.ts`
- `src/application/ports/ITaskRepository.ts`, `IScheduleRepository.ts`, `IReminderRepository.ts`
- `src/application/use-cases/tasks/*`, `schedules/*`, `reminders/*`
- `src/infrastructure/database/repositories/*`
- `src/infrastructure/scheduler/ReminderScheduler.ts`
- `src/infrastructure/database/schema.ts` (parcial — o mantener para migración futura)
- `src/interface/whatsapp/controllers/TaskController.ts`, `ScheduleController.ts`
- `src/domain/entities/Schedule.ts`

### Approaches

#### Approach A: Fetch directo en el controlador (sin puerto ni use case)

El `DCMController` llama a `fetch()` directamente para cada operación CRUD.

- **Pros**: Mínimo código nuevo, implementación rápida
- **Cons**: No testeable (mockear fetch es engorroso), mezcla lógica de aplicación con infraestructura, rompe el patrón hexagonal existente, difícil de cambiar si el API cambia
- **Esfuerzo**: Bajo

#### Approach B: Puerto/adaptador hexagonal (recomendado)

Crear `IClientApi` (puerto), `ClientApiAdapter` (adaptador con fetch), use cases en aplicación, controlador dependiendo del puerto.

- **Pros**: Sigue el patrón existente del proyecto, testeable (se puede mockear el puerto), desacoplado del API, consistente con `ITaskRepository`/`TaskRepository`
- **Cons**: Más archivos, ligero overhead inicial
- **Esfuerzo**: Medio

#### Approach C: API client service con métodos tipeados

Crear una clase `DcmApiClient` con métodos `list()`, `getById()`, `create()`, `update()`, `delete()` y usarla directamente en el controlador.

- **Pros**: Tipado fuerte, más semántico que un repositorio genérico
- **Cons**: Sigue acoplando controlador a infraestructura, no hay puerto para testear, mezcla concerns
- **Esfuerzo**: Bajo-Medio

### Recommendation

**Approach B** — Puerto/adaptador hexagonal. Razones:

1. Es el patrón que YA USA el proyecto. Cambiarlo ahora sería incoherente.
2. El controlador depende de una abstracción (`IClientApi`), no de `fetch`. Se puede testear con un mock.
3. Si el API cambia (endpoints, auth, etc.), solo toca el adaptador.
4. Los use cases mantienen la misma estructura que `CreateTaskUseCase`, `ListTasksUseCase`, etc.

El adaptador usará **fetch nativo** (sin axios ni otras librerías HTTP), como se acordó previamente.

### Conversation Flow Design

```
Menú Principal DCM:
👗 *Asistente de Confección - DCM*

1️⃣ *Clientes*
   ├── 1.1 Crear cliente nuevo
   ├── 1.2 Ver todos los clientes  
   ├── 1.3 Ver detalle de cliente
   ├── 1.4 Actualizar cliente
   └── 1.5 Eliminar cliente

2️⃣ *Ayuda*
0️⃣ Volver al menú principal
```

**Flow 1.1 — Crear cliente** (paso a paso):
1. Bot: "👤 *Nombre del cliente*:"
2. User responde → Bot: "📧 *Email*:"
3. User responde → Bot: "📱 *Teléfono*:"
4. User responde → Bot envía formato de medidas:
   ```
   📏 *Medidas* — Enviá TODAS en un solo mensaje:
   AE:42 TD:38 TE:40 CP:96
   ALB:28 SB:20 CC:72 CK:94
   ALK:18 LT:160 LM:60 LSH:22
   ```
5. User envía medidas → Bot valida y crea vía API → "✅ Cliente creado"

**Flow 1.2 — Ver todos**: Bot lista clientes con nombre + email, numerados.

**Flow 1.3 — Ver detalle**: Bot muestra lista numerada → user elige → Bot muestra datos + todas las medidas formateadas.

**Flow 1.4 — Actualizar**: Bot muestra lista numerada → user elige → Bot pregunta qué campo (1: nombre, 2: email, 3: teléfono, 4: medidas) → user responde → Bot actualiza vía API.

**Flow 1.5 — Eliminar**: Bot muestra lista numerada → user elige → Bot pide confirmación → user confirma → Bot elimina vía API.

**Estados de state machine necesarios:**
- `waiting_client_name`
- `waiting_client_email`
- `waiting_client_phone`
- `waiting_client_measures`
- `waiting_client_select` (seleccionar de lista)
- `waiting_client_update_field`
- `waiting_client_update_value`
- `waiting_client_confirm_delete`

### Risks

1. **Medidas requeridas (all 12)**: El API las marca como `required: true` en Mongoose. Si el usuario no envía todas, hay que rechazar y pedir de nuevo. La validación en el adaptador HTTP es crítica.
2. **ID de MongoDB**: El API usa `_id` de MongoDB. La respuesta no incluye un `id` plano — hay que mapear `_id` a `id` en el adaptador o trabajar con `_id` en las URLs.
3. **Formato de respuestas**: El API devuelve objetos anidados (`{ user: {...} }`, `{ users: [...] }`). El adaptador necesita parsear correctamente según el endpoint.
4. **Sin tests actualmente**: No hay test runner configurado (detectado en SDD Init). Al no tener tests, la ventaja de testabilidad del Approach B es teórica hasta que se configure uno.
5. **Eliminación de archivos existentes**: Se eliminan TaskController, ScheduleController, etc. Asegurarse de respaldar o commitear antes de borrar.

### Ready for Proposal
Yes
