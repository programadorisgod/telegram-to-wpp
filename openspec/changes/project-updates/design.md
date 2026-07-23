# Design: Project Updates — Natural Conversation Mode

## Technical Approach

Add a `project_updates` table + entity for free-form conversational updates on projects. Three new waiting states in `AstralController` (select project → enter update → loop for more). Follow existing Astral patterns: Zod entity, Drizzle schema, repo port + Turso impl, use cases injected via constructor.

## Architecture Decisions

### Schema: `project_updates` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text PK` | UUID v4 |
| `project_id` | `text NOT NULL` | FK → `projects.id` |
| `user_id` | `text NOT NULL` | FK → `users.user_id` |
| `content` | `text NOT NULL` | Free-text, max 1000 |
| `created_at` | `text NOT NULL` | ISO 8601 |

Index on `(project_id, created_at)` — history queries scan by project ordered by time.

### Handler placement: inside AstralController

**Choice**: Three sequential states within `AstralController.handleWaiting()`.
**Alternatives**: Separate controller class, or a generic "conversation mode" controller.
**Rationale**: Matches all existing patterns (task, project, registration). Single switch-case, consistent error handling, same DI wiring approach.

### Menu position: new option "5"

**Choice**: Add as "5️⃣ Actualizar proyecto", renumbering NLP help to "6️⃣".
**Alternatives**: Insert as "4️⃣" and renumber everything.
**Rationale**: Minimal disruption — existing muscle memory for 1-4 stays. The update flow is adjacent to project management but doesn't replace help.

### Exit detection: inline in handlers

**Choice**: Detect "0", "menu", "salir", "volver" at any update state.
**Rationale**: Users may want out mid-update. Explicit exit prevents being stuck in the loop.

## Data Flow

```
User → AstralFeature.handleSubmenuCommand("5")
  ↓
send project list numbered → state: astral::waiting_project_select_for_update
  ↓
User picks number → validate → save projectId in state
  ↓
send "Decime tu update" → state: astral::waiting_project_update
  ↓
User types content → LogProjectUpdate.execute() → DB save
  ↓
send "✅ Guardado. ¿Querés agregar más?"
  ↓ state: astral::waiting_project_update_more
User: "sí" → re-enter waiting_project_update (loop)
User: "no" / "0" / "menu" / "salir" → astral::menu + show menu
```

## States

| State | Entry Trigger | Input | Next State |
|-------|--------------|-------|------------|
| `astral::waiting_project_select_for_update` | User picks "5" | Number from list | `waiting_project_update` or `astral::menu` (invalid) |
| `astral::waiting_project_update` | User picked project | Free text | `waiting_project_update_more` |
| `astral::waiting_project_update_more` | Update saved | "sí"/"no"/exit words | `waiting_project_update` or `astral::menu` |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/db-core/src/schema/project_updates.ts` | Create | Drizzle table + types |
| `packages/db-core/src/schema/index.ts` | Modify | Export `projectUpdates` + types |
| `packages/db-core/src/index.ts` | Modify | Re-export new re-exports |
| `src/domain/entities/astral/ProjectUpdate.ts` | Create | Zod schema + class |
| `src/application/ports/IAstralProjectUpdateRepository.ts` | Create | Port: `save`, `findByProjectId`, `findLatest` |
| `src/application/use-cases/astral/LogProjectUpdate.ts` | Create | Creates entity, calls repo.save |
| `src/application/use-cases/astral/QueryProjectUpdates.ts` | Create | Calls repo.findLatest, formats output |
| `src/infrastructure/db/TursoProjectUpdateRepository.ts` | Create | Drizzle impl with `eq` + `desc` ordering |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modify | Add 3 handlers + switch cases, inject new use cases |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Modify | Renumber menu, add prompts for project select, update input, history |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Modify | Add "5" → controller method, text aliases, DI params |
| `src/main.ts` | Modify | Wire repo + use cases, pass to AstralFeature |

## Interfaces / Contracts

```typescript
// Port
export interface IAstralProjectUpdateRepository {
  save(update: NewProjectUpdate): Promise<ProjectUpdate>;
  findByProjectId(projectId: string): Promise<ProjectUpdate[]>;
  findLatestByProjectId(projectId: string, limit: number): Promise<ProjectUpdate[]>;
}

// Entity
export const ProjectUpdateSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1),
  userId: z.string().min(1),
  content: z.string().min(1).max(1000),
  createdAt: z.string().datetime(),
});

// DTOs
export interface LogProjectUpdateDTO {
  projectId: string;
  userId: string;
  content: string;
}
export interface QueryProjectUpdatesDTO {
  projectId: string;
  limit?: number;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | ProjectUpdate entity creation + validation | Zod parse, boundary cases (empty content, max length) |
| Unit | LogProjectUpdate + QueryProjectUpdates use cases | Mock repo, verify calls + output |
| Integration | TursoProjectUpdateRepository | In-memory libSQL with Drizzle |
| E2E | Full WhatsApp flow | Manual: select project → write update → add more → exit |

## Migration / Rollout

`drizzle-kit generate` for `project_updates` → `drizzle-kit migrate`. New table only — no schema changes to `projects` or existing tables. Zero-downtime: old code ignores the new table, new code reads/writes it.

## Rollback Plan

1. Revert `main.ts` (remove wiring)
2. Revert `AstralFeature.ts` (menu entry + DI)
3. Revert `AstralController.ts` (handlers + switch cases)
4. Revert `AstralMenuService.ts` (strings)
5. Drop `project_updates` table via `drizzle-kit drop` or manual SQL
6. Delete new files (schema, entity, port, use cases, repo)
7. No data loss to existing entities

## Open Questions

None.
