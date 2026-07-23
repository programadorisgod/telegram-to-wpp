# User Registration Specification

## Purpose

Define the first-time user onboarding flow — username and country (ISO-3166) collection, persistence in Turso, and the registration gate that routes unregistered users to the registration controller before any other feature.

## Requirements

### Requirement: Registration Gate

The system MUST check if the sender's WhatsApp chatId exists in the `users` table before routing any message to feature controllers. Unregistered senders MUST be auto-prompted with the registration flow.

#### Scenario: First-time user sees registration prompt

- GIVEN a sender with chatId not present in `users`
- WHEN the sender sends any message
- THEN the system responds with a username prompt instead of the main menu

#### Scenario: Registered user bypasses gate

- GIVEN a sender with chatId present in `users`
- WHEN the sender sends any message
- THEN the system proceeds to normal routing without registration prompt

### Requirement: User Data Model

The system MUST persist users with chatId as primary key, a non-empty username, and an ISO-3166 alpha-2 country code.

#### Scenario: Successful registration

- GIVEN an unregistered sender is in the registration flow
- WHEN they provide a non-empty username and a valid ISO-3166 country code
- THEN the record is inserted into `users` with `{ chatId, username, countryCode, createdAt }`
- AND a welcome message confirms registration

#### Scenario: Duplicate chatId prevented

- GIVEN a chatId already exists in `users`
- WHEN a registration attempt occurs for the same chatId
- THEN the system SHALL return an error — the caller MUST enforce the gate to prevent this

#### Scenario: Country code validation

- GIVEN a user provides an invalid country code (not ISO-3166 alpha-2)
- WHEN the registration controller validates input
- THEN the system SHALL reject with a clear error message and re-prompt

#### Scenario: Empty username rejected

- GIVEN a user provides an empty or whitespace-only username
- WHEN the registration controller validates input
- THEN the system SHALL reject with a clear error message and re-prompt

### Requirement: Country Code Resolution

The system SHOULD accept the country as a full name (e.g., "Colombia", "Argentina") or an ISO-3166 alpha-2 code and normalize to the alpha-2 code for storage.

#### Scenario: Full name resolution

- GIVEN the user types "Colombia"
- WHEN the registration controller processes the input
- THEN the system resolves it to "CO" and persists that value

#### Scenario: Unknown country name

- GIVEN the user types an unrecognizable country name
- WHEN the registration controller resolves it
- THEN the system SHALL reject with "País no reconocido" and re-prompt

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Validation | Username MUST be 1–50 characters after trim. Country code MUST be exactly 2 uppercase alpha characters. |
| NF2 | Persistence | User records MUST survive process restart. |
| NF3 | Cost | Registration gate is a single DB lookup per message — MUST complete in <50ms. |
