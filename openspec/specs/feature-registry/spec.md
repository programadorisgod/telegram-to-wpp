# Feature Registry Specification

## Purpose

Define the extensible feature system for the WhatsApp bot, enabling multiple features to coexist without modifying `MessageHandler` for each new feature. Features register through a `BotFeature` interface, and `MessageHandler` iterates them generically for menu rendering, command routing, waiting state delegation, text alias resolution, and help aggregation.

## Requirements

### Requirement: BotFeature Interface

The system MUST define a `BotFeature` interface that serves as the contract for any feature.

#### Scenario: Interface contract
- GIVEN a new feature is being added
- WHEN it implements `BotFeature`
- THEN it MUST provide `readonly name: string` as a unique namespace identifier
- AND it MUST provide `getMenuEntries(): string[]` returning menu lines for the aggregated menu
- AND it MAY implement `getSubmenuMenu?(): string` returning a feature-specific submenu view
- AND it MAY implement `handleSubmenuCommand?(sender, command, data): Promise<boolean>` for routing commands within the feature's context
- AND it MAY implement `handleWaitingInput?(sender, text, context, data): Promise<boolean>` for handling input during waiting states
- AND it MAY implement `getTextAliases?(): string[]` for text-based feature routing
- AND it MAY implement `getHelpEntries?(): string[]` for aggregated help output

### Requirement: Aggregated Main Menu

The system MUST render a single aggregated main menu combining entries from all registered features, numbered sequentially.

#### Scenario: Single feature
- GIVEN exactly one registered feature (e.g., `DCMFeature`)
- WHEN the main menu is rendered via `sendAggregatedMenu()`
- THEN the feature's entries are prefixed with `1️⃣`
- AND the last entry is the Help option at `2️⃣`
- AND option `0️⃣` Volver is shown

#### Scenario: Multiple features
- GIVEN two registered features
- WHEN the main menu is rendered
- THEN feature 1 gets `1️⃣` prefix, feature 2 gets `2️⃣` prefix
- AND Help is at `3️⃣`

### Requirement: Top-Level Feature Routing

The system MUST route the user into a feature's context when they select the feature's top-level number or use a text alias.

#### Scenario: Numeric selection
- GIVEN the user is at the main menu
- WHEN they type the feature's top-level number (e.g., `1`)
- THEN the state context is set to `{feature.name}::menu`
- AND the feature's submenu view is shown (via `getSubmenuMenu()` if available, else the aggregated menu)

#### Scenario: Text alias routing
- GIVEN the user is at the main menu
- WHEN they type a text alias registered by a feature (e.g., `"clientes"`)
- THEN the state context is set to `{feature.name}::menu`
- AND the feature's submenu view is shown

### Requirement: Dotted Command Routing

The system MUST support dotted commands (e.g., `1.2`) from the main menu to directly trigger a subcommand within a feature.

#### Scenario: Valid dotted command
- GIVEN the user is at the main menu
- WHEN they type `1.2`
- THEN the state context is set to `{feature.name}::menu`
- AND `handleSubmenuCommand` is called with `"2"` on feature index 0 (feature 1)

#### Scenario: Invalid dotted command
- GIVEN the user is at the main menu
- WHEN they type an out-of-range dotted command (e.g., `5.1` with only 1 feature)
- THEN the system shows "Opción inválida" and re-displays the main menu

### Requirement: Feature Submenu Command Routing

When the user is inside a feature's context, commands MUST be routed to that feature's `handleSubmenuCommand`.

#### Scenario: Valid submenu command
- GIVEN the user is in `dcm::menu` context
- WHEN they type `"1"`
- THEN `handleSubmenuCommand` is called on the DCM feature
- AND if the feature handles it, the response is shown

#### Scenario: Invalid submenu command
- GIVEN the user is in `dcm::menu` context
- WHEN they type an unrecognized command
- THEN the feature returns `false`
- AND MessageHandler shows "Opción inválida" and re-displays the feature's menu

### Requirement: Waiting State Delegation

When the user is in a waiting state, the system MUST delegate input handling to the feature that owns the waiting context.

#### Scenario: Waiting input handled by feature
- GIVEN the user is in `dcm::waiting_name` context
- WHEN they send text
- THEN MessageHandler iterates features to find one whose `name + "::waiting"` prefix matches the context
- AND calls `handleWaitingInput` with the namespace-stripped context (e.g., `"waiting_name"`)
- AND if the feature returns `true`, the response is sent

#### Scenario: Waiting input not handled by any feature
- GIVEN the user is in `dcm::waiting_name` context
- WHEN no feature claims the waiting input
- THEN the system returns to the aggregated main menu

### Requirement: Help Aggregation

The system MUST aggregate help entries from all registered features.

#### Scenario: Help command
- GIVEN the user types `"ayuda"` or the help number
- WHEN the help is rendered
- THEN it shows global commands plus each feature's `getHelpEntries()` output

### Requirement: Context Namespacing Convention

All feature contexts in `ConversationStateMachine` MUST use a `{featurename}::` prefix to prevent context collisions between features.

#### Scenario: DCM contexts are namespaced
- GIVEN `DCMFeature` has `name = "dcm"`
- WHEN DCMController calls `setState`
- THEN all contexts use `dcm::` prefix (e.g., `dcm::menu`, `dcm::waiting_name`)

#### Scenario: Context isolation
- GIVEN two features with names `dcm` and `tasks`
- WHEN both use their respective prefixes
- THEN there is no context collision (`dcm::menu` ≠ `tasks::menu`)

### Requirement: ConversationStateMachine Type Relaxation

The `UserState.context` field MUST be `string` (not a union type) to support dynamic feature context names.

#### Scenario: Dynamic context assignment
- GIVEN a feature with name `"tasks"`
- WHEN the context is set to `"tasks::menu"`
- THEN the state machine accepts it without type errors

#### Scenario: `isWaiting` backwards compatibility
- GIVEN a context string
- WHEN checking `isWaiting()`
- THEN it returns `true` if the context includes `::waiting` OR starts with `waiting`

### Requirement: First Feature Implementation — DCMFeature

The system MUST provide `DCMFeature` as the first `BotFeature` implementation, wrapping `DCMController` + `DCMenuService` with full behavioral equivalence to the pre-feature-registry DCM behavior.

#### Scenario: DCM menu entries
- GIVEN `DCMFeature`
- WHEN `getMenuEntries()` is called
- THEN it returns the same menu lines as the original `mainMenu()` output

#### Scenario: Submenu command delegation
- GIVEN the user is in `dcm::menu` context
- WHEN they type commands 1–5
- THEN they are delegated to `startCreation`, `showAll`, `promptDetail`, `promptUpdate`, `promptDelete` respectively

#### Scenario: Text aliases for submenu commands
- GIVEN the user is in `dcm::menu` context
- WHEN they type "crear cliente", "ver todos", "ver detalle", "actualizar", or "eliminar"
- THEN they are resolved to the corresponding numeric command

#### Scenario: Waiting input delegation
- GIVEN the user is in a DCM waiting context
- WHEN `handleWaitingInput` is called
- THEN it delegates to `DCMController.handleWaiting()` with the stripped context

#### Scenario: Text alias "clientes"
- GIVEN the user types "clientes" from the main menu
- THEN `DCMFeature.getTextAliases()` returns `["clientes"]`
- AND MessageHandler routes to the DCM feature
