# Persistent State Machine Specification

## Purpose

Persist conversation state machine data to the database so that user sessions survive process restarts and crashes.

## Requirements

### Requirement: State Snapshots to Database

The ConversationStateMachine MUST persist state transitions to the Turso database asynchronously.

#### Scenario: State is saved after each transition

- GIVEN a user's state changes from "main" to "astral::waiting_task_raw"
- WHEN setState is called
- THEN the new state MUST be persisted to the database
- AND the persist operation MUST NOT block the setState return (async, fire-and-forget)

#### Scenario: State is restored on application startup

- GIVEN the application restarts after a crash
- WHEN the ConversationStateMachine initializes
- THEN it MUST load all user states from the database
- AND users MUST resume their previous conversations

#### Scenario: Stale states are cleaned up on load

- GIVEN user states older than 24 hours exist in the database
- WHEN the state machine loads states from DB
- THEN stale states MUST be deleted
- AND only recent states MUST be loaded into memory

### Requirement: State Schema in Database

A new table MUST store user state data with appropriate indexes.

#### Scenario: user_states table stores conversation state

- GIVEN a new user state needs to be persisted
- WHEN the state is written to the database
- THEN it MUST be stored in a user_states table with columns: userId (PK), context, data (JSON), updatedAt
- AND updatedAt MUST be automatically set to the current timestamp

### Requirement: Fallback to Memory-Only Mode

If the database is unavailable, the state machine MUST fall back to in-memory-only mode with a warning.

#### Scenario: DB write fails silently

- GIVEN the Turso database is unreachable
- WHEN a state transition occurs
- THEN the state MUST be stored in memory only
- AND a warning MUST be logged
- AND the application MUST NOT crash
