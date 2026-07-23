# Proposal: Feature Registry

## Intent

Decouple the bot from DCM so multiple features coexist without modifying MessageHandler for each new feature.

## Scope

### In Scope
1. Create `BotFeature` interface — contract for any feature
2. Create `DCMFeature` wrapper — adapts DCMController + DCMenuService to `BotFeature`
3. `ConversationStateMachine` — `UserContext` union → `string` for dynamic contexts
4. `MessageHandler` — accept `BotFeature[]`, iterate features for waiting/submenu/dotted routing
5. `DCMController` — rename contexts (`clients`→`dcm::menu`, `waiting_*`→`dcm::waiting_*`)
6. `main.ts` — instantiate `DCMFeature`, pass array to `MessageHandler`

### Out of Scope
- Moving DCMController or DCMenuService files
- Creating new features (tasks, etc.) — Phase 3
- Changing the auth gate

## Capabilities

### New Capabilities
- `feature-registry`: Extensible feature system — features register via `BotFeature` interface, `MessageHandler` iterates them generically

### Modified Capabilities
- `client-management`: Routed through `DCMFeature` wrapper instead of direct coupling in `MessageHandler`. Contexts scoped (`dcm::` prefix). Behavioral equivalence preserved.

## Approach

1. **BotFeature.ts** — interface: `name`, `getMenuEntries()`, `handleSubmenuCommand?()`, `handleWaitingInput?()`
2. **DCMFeature.ts** — wraps DCMController + DCMenuService, delegates submenu (1–5), waiting states, dotted commands
3. **ConversationStateMachine** — `UserContext` union → `string`
4. **MessageHandler** — remove DCM imports/constructor deps, iterate `BotFeature[]` for: waiting delegation, submenu routing, dotted/text commands
5. **DCMController** — rename all `setState` contexts: `clients`→`dcm::menu`, `waiting_client_*`→`dcm::waiting_*`
6. **main.ts** — wrap DCM in `DCMFeature`, pass `[dcmFeature]`

## Key Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Context naming | Rename all now — `dcm::` prefix | Mechanical ~20-line change. Aliases add tech debt. |
| 2 | Invalid submenu cmd | Error + aggregated main menu | Feature shouldn't own cross-feature rendering. |
| 3 | Text aliases | Optional `getTextAliases()` on feature | Cleaner than hardcoded switch in MessageHandler. |
| 4 | Menu format | Feature controls entry text; MH aggregates | Simple concatenation, no delegation complexity. |

## Affected Areas

| Area | Impact |
|------|--------|
| `src/interface/whatsapp/BotFeature.ts` | New |
| `src/interface/whatsapp/dcm/DCMFeature.ts` | New |
| `src/interface/whatsapp/dcm/index.ts` | New |
| `src/interface/whatsapp/ConversationStateMachine.ts` | Modified |
| `src/interface/whatsapp/MessageHandler.ts` | Modified |
| `src/interface/whatsapp/controllers/DCMController.ts` | Modified |
| `src/main.ts` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missed context rename in DCMController | Medium | Grep `"clients"` + `"waiting_"` after changes. tsc catches type mismatches. |
| Regression in DCM creation wizard | Medium | No logic changes — only delegation path. Manual smoke test of CRUD. |
| `dcm::` prefix clashes with future features | Low | Convention set: `featurename::context`. Document in BotFeature. |

## Rollback Plan

Revert branch commit. All changes are additive (new files) or mechanical (context rename, wiring). No data to migrate.

## Dependencies

None.

## Success Criteria

- [ ] `tsc --noEmit` passes
- [ ] Menu renders with DCM entries (identical to before)
- [ ] Navigation: menu → clientes → submenu (1–5) → back — all work identically
- [ ] DCM creation flow (name → email → phone → 12 measures) completes
- [ ] DCM update/delete flows work
- [ ] Unauthorized users still blocked by auth gate (unchanged)
- [ ] Text alias `"clientes"` routes to DCM menu
