# Archive Report: feature-registry

**Archived**: 2026-06-01
**Verdict**: PASS WITH WARNINGS
**Archive path**: `openspec/changes/archive/2026-06-01-feature-registry/`

## Summary

Created an extensible feature system (`BotFeature` interface + registry pattern) to decouple the bot from DCM. The first feature (`DCMFeature`) wraps DCMController + DCMenuService, preserving all existing DCM behavior. `MessageHandler` now accepts `BotFeature[]` and iterates features generically for menu rendering, command routing, waiting state delegation, text alias resolution, and help aggregation.

## What was built

| Artifact | Description |
|----------|-------------|
| `BotFeature.ts` | Interface: `name`, `getMenuEntries()`, `getSubmenuMenu?()`, `handleSubmenuCommand?()`, `handleWaitingInput?()`, `getTextAliases?()`, `getHelpEntries?()` |
| `DCMFeature.ts` | First feature implementation — wraps DCMController + DCMenuService |
| `features/dcm/index.ts` | Barrel export for DCMFeature |

## What was modified

| File | Changes |
|------|---------|
| `ConversationStateMachine.ts` | `UserContext` union → `string`; `isWaiting()` checks `::waiting` prefix |
| `MessageHandler.ts` | Removed DCM imports; accepts `BotFeature[]`; generic iteration for all routing |
| `DCMController.ts` | Contexts renamed: `clients`→`dcm::menu`, `waiting_*`→`dcm::waiting_*` |
| `main.ts` | Instantiates `DCMFeature`, passes `[dcmFeature]` to `MessageHandler` |

## Warnings (from verify report)

1. **Navigation regression**: Pressing "1" from main menu shows main menu instead of client submenu. User must press twice.
2. **Text alias "crear cliente"**: Hidden shortcut removed.
3. **`isWaiting()` dead code**: Method defined but unused.
4. **Suggestion**: Add `getMenuView()` to BotFeature for feature-specific submenu views.

## Files created
- `src/interface/whatsapp/features/BotFeature.ts`
- `src/interface/whatsapp/features/dcm/DCMFeature.ts`
- `src/interface/whatsapp/features/dcm/index.ts`

## Files modified
- `src/interface/whatsapp/ConversationStateMachine.ts`
- `src/interface/whatsapp/MessageHandler.ts`
- `src/interface/whatsapp/controllers/DCMController.ts`
- `src/main.ts`

## Specs updated
- Created `openspec/specs/feature-registry/spec.md` — new spec documenting the BotFeature interface, feature registry pattern, context namespacing, and DCMFeature as the first implementation.

## Next steps
- **Phase 3**: Add new features (tasks, inventory, etc.) by implementing `BotFeature` and adding to the `features` array in `main.ts`
- **Fix navigation regression**: Add `getSubmenuMenu()` or change top-level routing to show feature-specific view instead of re-showing main menu
