# Spec: contact-search

## Capability: contact-search

_This is a new capability for the `send-reminder-to-contact` change._

## Purpose

Allow users to search WhatsApp contacts by name or number and select one as the recipient of a task reminder. Enables delegation: sending reminders to contacts other than the message creator.

## Requirements

### Requirement: Contact Search

The system MUST search WhatsApp contacts by partial name or number match (case-insensitive). Results MUST include both saved contacts (`isMyContact: true`) and conversation contacts (`isWAContact: true`), deduplicated by WhatsApp ID. Results MUST be capped at 10.

#### Scenario: Search finds matching contacts

- GIVEN the user has contacts "María Pérez" and "Mariano López"
- WHEN the user searches "María"
- THEN the system returns matching contacts, limited to 10 entries

#### Scenario: Search with no results

- GIVEN the user has no contacts matching "Xyzzy"
- WHEN the user searches "Xyzzy"
- THEN the system returns no matches and offers retry or cancel

### Requirement: Contact Selection

The system MUST present results as a numbered list and accept numeric selection. Out-of-range input MUST prompt retry.

#### Scenario: Valid selection

- GIVEN 3 matching contacts numbered 1–3
- WHEN the user replies "2"
- THEN the second contact is selected as scheduledFor

#### Scenario: Invalid selection

- GIVEN contacts numbered 1–3
- WHEN the user replies "5"
- THEN the system asks for a number between 1 and 3

### Requirement: Default Self

The system MUST offer "Para mí" to skip search. Self selection sets scheduledFor to NULL.

#### Scenario: Choose self

- GIVEN the user is creating a reminder
- WHEN the user selects "Para mí"
- THEN the task has scheduledFor = NULL, reminder goes to creator

### Requirement: Nameless Contact Display

Contacts without name or pushname MUST display as "📱 {number}".

#### Scenario: Number-only display

- GIVEN a contact with only a phone number
- WHEN shown in search results
- THEN displayed as "📱 +54 9 11 2345 6789"

### Requirement: Duplicate Names

Contacts sharing the same name with different numbers MUST appear as separate entries.

#### Scenario: Same name, different numbers

- GIVEN two "Carlos" contacts with different numbers
- WHEN matching a search
- THEN both appear as separate numbered entries

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Performance | Contacts cached in-memory per session — avoid re-fetching getContacts() on every keystroke |
| NF2 | Performance | Search response MUST be < 1s from user input |
| NF3 | Correctness | Search MUST be case-insensitive |
