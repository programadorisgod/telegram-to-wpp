# Telegram Bridge Specification

## Purpose

Define the bidirectional chat bridge between authorized WhatsApp users and a configured Telegram group. Authorized WPP users can enter a bridge mode where their text messages are forwarded to Telegram, and all Telegram group messages are broadcast back to every WPP user currently in bridge mode.

## Requirements

### Requirement: Bridge Mode Activation

The system MUST present a "Chat Telegram" option in the main menu to authorized WhatsApp users. Upon selection, the system SHALL transition the conversation to `bridge::active` state and confirm entry to bridge mode.

#### Scenario: Authorized user activates bridge

- GIVEN the sender is in `BRIDGE_AUTHORIZED_WPP_IDS`
- WHEN the sender is at the main menu and selects the Telegram bridge option
- THEN the system enters `bridge::active` state and replies with a confirmation message

#### Scenario: Unauthorized user does not see the option

- GIVEN the sender is NOT in `BRIDGE_AUTHORIZED_WPP_IDS`
- WHEN the system renders the main menu
- THEN the "Chat Telegram" option MUST NOT appear

### Requirement: WPP to Telegram Forwarding

While the conversation is in `bridge::active` state, every text message the user sends MUST be forwarded to the configured Telegram group via the bridge bot. The forwarded message SHALL include the sender's WhatsApp name as a prefix.

#### Scenario: Forward text in bridge mode

- GIVEN the conversation is in `bridge::active` state
- WHEN the user sends a text message that is NOT an exit command
- THEN the system forwards the message to `TELEGRAM_GROUP_ID`
- AND the message SHALL be prefixed with the sender's name (e.g., `👤 Nombre: {message}`)

### Requirement: Telegram to WPP Broadcast

Every message received in the configured Telegram group via the bridge bot MUST be broadcast to ALL WhatsApp sessions whose conversation is in `bridge::active` state.

#### Scenario: Broadcast to active sessions

- GIVEN one or more WPP sessions are in `bridge::active` state
- WHEN a message arrives in the Telegram group via the bridge bot
- THEN the system SHALL deliver the message to every active bridge session
- AND the message SHALL be prefixed with the Telegram sender's name (e.g., `👤 Telegram Name: {message}`)

#### Scenario: No active sessions — no delivery

- GIVEN zero WPP sessions are in `bridge::active` state
- WHEN a message arrives in the Telegram group
- THEN the system MUST NOT send any WhatsApp messages

### Requirement: Exit from Bridge Mode

The commands `menu`, `0`, and `inicio` MUST be intercepted while in `bridge::active` state. They SHALL exit bridge mode (return to main menu state) and MUST NOT be forwarded to Telegram.

#### Scenario: Exit via menu command

- GIVEN the conversation is in `bridge::active` state
- WHEN the user sends "menu", "0", or "inicio"
- THEN the system transitions state from `bridge::active` to the main menu state
- AND the message MUST NOT be forwarded to Telegram

#### Scenario: Non-exit text forwarded normally

- GIVEN the conversation is in `bridge::active` state
- WHEN the user sends any text other than the exit commands
- THEN the system MUST forward the message to Telegram
- AND the conversation remains in `bridge::active` state

### Requirement: Concurrent Bridge Sessions

Multiple authorized WhatsApp users MAY be in `bridge::active` state simultaneously. Each session's messages SHALL be forwarded to Telegram independently. Telegram broadcasts SHALL reach all currently active sessions.

#### Scenario: Two users in bridge mode

- GIVEN two authorized WPP users (A and B) are both in `bridge::active` state
- WHEN user A sends a message
- THEN the message is forwarded to Telegram once, prefixed with user A's name
- WHEN a Telegram message arrives
- THEN it SHALL be delivered to both user A and user B

### Requirement: Environment Configuration

The system MUST validate all bridge-related environment variables at startup. Missing or invalid values SHALL cause the bridge feature to fail closed — no bridge functionality without all three vars present and valid.

#### Scenario: Missing env var prevents bridge init

- GIVEN any of `BRIDGE_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, or `BRIDGE_AUTHORIZED_WPP_IDS` is missing or empty
- WHEN the application starts
- THEN the bridge feature MUST NOT be registered
- AND the system SHALL log a warning and continue without bridge functionality

#### Scenario: All env vars present

- GIVEN `BRIDGE_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, and `BRIDGE_AUTHORIZED_WPP_IDS` are all set and valid
- WHEN the application starts
- THEN the bridge bot SHALL start in polling mode
- AND the bridge feature SHALL be available to authorized users
