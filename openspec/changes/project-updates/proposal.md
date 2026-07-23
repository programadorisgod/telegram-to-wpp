# Proposal: Project Updates — Natural Conversation Mode

## Intent

Users currently create projects and list them, but can't log free-form progress, notes, or status updates to a project conversationally. This forces them to use external notes or lose context between sessions. Add a "conversation mode" where each message from the user is saved as a structured update on the selected project, with a history view.

## Scope

### In Scope
- **New DB entity**: `project_updates` table (id, project_id, content, created_at)
- **New repository**: `IAstralProjectUpdateRepository` + `TursoProjectUpdateRepository`
- **New domain entity**: `ProjectUpdate`
- **New use cases**: `LogProjectUpdate` (save update), `QueryProjectUpdates` (history by project)
- **Menu flow**: New option "Actualizar proyecto" → select project from list → enter conversation mode
- **Conversation states**: `astral::waiting_project_select_for_update`, `astral::waiting_project_update`, `astral::waiting_project_update_more`
- **History view**: Command to view last N updates on a project
- **Menu updates**: `AstralMenuService` — strings for update mode, project selection prompt, history format
- **DI wiring**: Wire new use cases + repos in `main.ts`

### Out of Scope
- Intent classification or NLP for updates (saved as-is, no structured parsing)
- Reminder scheduling on updates
- Editing or deleting individual updates (MVP is append-only)
- Media attachments on updates (text-only MVP)

## Capabilities

### New Capabilities
- `project-updates`: Free-text conversational updates on projects — log, query history, enter/exit update mode

### Modified Capabilities
- `project-management`: Project listing SHALL support selection for entering update mode (new flow after "list projects")

## Approach

1. **Domain layer**: Add `ProjectUpdate` entity with `id, projectId, content, createdAt`. Extend `Project` with `hasUpdates` query method (optional convenience).
2. **Application layer**: Add `IAstralProjectUpdateRepository` port (save, findByProjectId, findLatest). Add `LogProjectUpdate` and `QueryProjectUpdates` use cases.
3. **Infrastructure**: Add `project_updates` Drizzle schema to `db-core`. Add `TursoProjectUpdateRepository` in `src/infrastructure/db/`.
4. **Interface**: Add new conversation states in `AstralController.handleWaiting()`:
   - `waiting_project_select_for_update` → user picks a project number from list
   - `waiting_project_update` → user types free text, saved as update, asks "want to add more?"
   - `waiting_project_update_more` → yes/no loop to continue or exit
5. **Menu**: Add "4️⃣ Actualizar proyecto" to `AstralMenuService.rememberAllMenu()`. Add prompts for project selection, update input, history view.
6. **Wiring**: Instantiate new repo + use cases in `main.ts` and pass to `AstralFeature` constructor.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db-core/src/schema/` | New | `project_updates.ts` Drizzle table |
| `packages/db-core/src/index.ts` | Modified | Export new types |
| `src/domain/entities/astral/ProjectUpdate.ts` | New | Domain entity |
| `src/application/ports/IAstralProjectUpdateRepository.ts` | New | Repository port |
| `src/application/use-cases/astral/LogProjectUpdate.ts` | New | Use case |
| `src/application/use-cases/astral/QueryProjectUpdates.ts` | New | Use case |
| `src/infrastructure/db/TursoProjectUpdateRepository.ts` | New | Repo implementation |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | New waiting handlers |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Modified | New prompt strings |
| `src/interface/whatsapp/features/astral/AstralFeature.ts` | Modified | Menu entries, DI params |
| `src/main.ts` | Modified | Wire new deps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Long projects lists with many projects — selection UX breaks | Low | Show numbered list, accept number input |
| User exits mid-update without explicit exit | Medium | Detect "0", "menu", "salir" as exit triggers |
| DB migration for existing projects | Low | New table, no schema changes to `projects` |

## Rollback Plan

1. Revert `main.ts` changes (remove new repo + use case wiring)
2. Revert `AstralFeature.ts` (remove menu entry + DI params)
3. Revert `AstralController.ts` (remove handler cases)
4. Drop `project_updates` table via Drizzle Kit rollback / manual SQL
5. No data loss to existing projects — new table only

## Dependencies

- Drizzle Kit migration for new `project_updates` table

## Success Criteria

- [ ] User can enter "Actualizar proyecto" from project menu
- [ ] User selects a project from a numbered list, enters update mode
- [ ] Each message is persisted as a `ProjectUpdate` with correct project_id and timestamp
- [ ] User can view last 5 updates on a project
- [ ] User exits update mode cleanly (back to astral menu)
- [ ] All existing project flows continue working unchanged
