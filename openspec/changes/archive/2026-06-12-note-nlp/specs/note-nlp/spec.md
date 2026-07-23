# Note NLP Specification

## Purpose

Extend LLM-based natural language understanding to note intents (list, view, create, update), replacing regex-based routing so users can manage notes with natural Spanish phrases — as fluid as task NLP.

## Requirements

### Requirement: LLM Prompt Extension

The system MUST extend `SYSTEM_PROMPT` in `TimeParserService.ts` with note intent detection, checked AFTER task intents (task > note > create fallback). The LLM MUST return one of: `note_list`, `note_view`, `note_create`, `note_update`, or `unknown`.

| Intent | Required Fields | Behavior |
|--------|----------------|----------|
| `note_list` | none | Show all notes |
| `note_view` | `noteTarget` | Fuzzy-match + show detail |
| `note_create` | `noteTitle?`, `noteContent?` | Create with given content, then ask about image |
| `note_update` | `noteTarget`, `noteContent` | Fuzzy-match + update, then ask about image |
| `unknown` | none | Show notes menu |

#### Scenario: User asks to list notes

- GIVEN user message "qué notas tengo" or "mostrame mis notas"
- WHEN the LLM classifies the intent
- THEN it MUST return `{"intent": "note_list"}`

#### Scenario: User asks to view a specific note

- GIVEN user message "mostrame la nota de la receta"
- WHEN the LLM classifies the intent
- THEN it MUST return `{"intent": "note_view", "noteTarget": "receta"}`

#### Scenario: User asks to create a note

- GIVEN user message "crea una nota que diga comprar leche"
- WHEN the LLM classifies the intent
- THEN it MUST return `{"intent": "note_create", "noteTitle": null, "noteContent": "comprar leche"}`

#### Scenario: User asks to update a note

- GIVEN user message "actualiza la nota de la receta por los nuevos ingredientes"
- WHEN the LLM classifies the intent
- THEN it MUST return `{"intent": "note_update", "noteTarget": "receta", "noteContent": "los nuevos ingredientes"}`

#### Scenario: Ambiguous note-related input

- GIVEN user message "nota" or "una nota" with no clear action
- WHEN the LLM classifies it
- THEN it MUST return `{"intent": "unknown"}`

#### Scenario: Priority — task intent before note intent

- GIVEN user message "recordame comprar leche" which matches task create
- WHEN the LLM evaluates the hierarchy (task > note > create)
- THEN it MUST return a task intent (`create`), NOT a note intent

### Requirement: JSON Response Parsing

`parseAIResponse()` in `TimeParserService.ts` MUST recognize note intents and extract `noteTarget`, `noteTitle`, `noteContent` from the LLM JSON response. Note intents SHALL return early (no date/time/description parsing needed).

#### Scenario: Successful note intent parse

- GIVEN LLM returns `{"intent": "note_view", "noteTarget": "receta"}`
- WHEN `parseAIResponse()` runs
- THEN it returns `{intent: "note_view", noteTarget: "receta", description: ""}`
- AND it does NOT try to extract date/time from the response

#### Scenario: LLM returns null for note input

- GIVEN the LLM returns `null` for a note-related message
- WHEN `parseAIResponse()` runs
- THEN it returns `null`
- AND the controller falls back to showing the notes menu

### Requirement: Regex Removal

The system MUST remove the regex note routing block (lines 125-134) from `processNaturalInput()` in `AstralController.ts`. After removal, ALL messages reach the LLM via `handleRawTask()` for intent classification. Projects and help routing SHALL remain as regex.

#### Scenario: Note message reaches LLM

- GIVEN user sends "qué notas tengo"
- WHEN `processNaturalInput()` runs
- THEN it does NOT intercept the message with regex
- AND the message flows to `handleRawTask()` → LLM classification

#### Scenario: Project and help still use regex

- GIVEN user sends "crear proyecto" or "ayuda"
- WHEN `processNaturalInput()` runs
- THEN the existing regex routing for projects and help still intercepts
- AND those messages do NOT reach the LLM

### Requirement: Note Intent Routing

The system MUST route LLM-classified note intents to existing note handlers. Routing SHALL happen after `this.timeParser.execute()` in `handleRawTask()` (or a new `handleNoteNlp()` method called from it).

| LLM Intent | Handler Called |
|------------|----------------|
| `note_list` | `showNotesList(sender)` |
| `note_view` | `findNoteByHint()` → `showNoteDetail()` |
| `note_create` | Create note with LLM-provided content → prompt for image |
| `note_update` | `findNoteByHint()` → update content → prompt for image |
| `unknown` | `showNotesMenu(sender)` |

#### Scenario: note_list shows all notes

- GIVEN the LLM returns `{"intent": "note_list"}`
- WHEN `handleRawTask()` processes the result
- THEN it calls `showNotesList(sender)`

#### Scenario: note_create with content then asks about image

- GIVEN the LLM returns `{"intent": "note_create", "noteContent": "ideas para el proyecto"}`
- WHEN routing runs
- THEN it creates the note with the LLM content
- AND transitions to `waiting_note_image_confirm` to ask about image attachment
- AND the existing `waiting_note_*` state machine is preserved

#### Scenario: note_update with direct match

- GIVEN the LLM returns `{"intent": "note_update", "noteTarget": "receta", "noteContent": "nuevos ingredientes"}`
- AND `findNoteByHint("receta")` finds exactly one note
- WHEN routing runs
- THEN it updates the matched note's content
- AND transitions to `waiting_note_update_image` for image handling
- AND the existing update state machine is preserved

### Requirement: findNoteByHint()

The system MUST implement `findNoteByHint(hint: string): Note | null` in `AstralController.ts` — fuzzy matching on note title first, then content. Lowercase `includes()` matching (same strategy as `findTaskByHint()`). Must be efficient given small note sets.

#### Scenario: Exact title match

- GIVEN notes with titles ["Receta de pasta", "Lista de compras"]
- AND hint is "receta de pasta"
- WHEN `findNoteByHint()` runs
- THEN it returns the note with title "Receta de pasta"

#### Scenario: Substring title match

- GIVEN notes with titles ["Receta de pasta", "Lista de compras"]
- AND hint is "pasta"
- WHEN `findNoteByHint()` runs
- THEN it returns the note with title "Receta de pasta"

#### Scenario: Content match when title fails

- GIVEN a note titled "Sin título" with content "Comprar pasta y salsa"
- AND hint is "pasta"
- AND no title matches
- WHEN `findNoteByHint()` runs
- THEN it returns the note with matching content

#### Scenario: No match returns null

- GIVEN notes with titles ["Receta de pasta"]
- AND hint is "ejercicio"
- WHEN `findNoteByHint()` runs
- THEN it returns null

### Requirement: Error Handling

The system MUST handle failure modes gracefully — never crash on missing or ambiguous note data.

#### Scenario: note_view without noteTarget

- GIVEN the LLM returns `{"intent": "note_view"}` with no `noteTarget`
- WHEN routing runs
- THEN it shows the notes menu instead of trying to find a note

#### Scenario: findNoteByHint returns null for view

- GIVEN `findNoteByHint()` returns null for the given `noteTarget`
- WHEN routing runs for `note_view` intent
- THEN it shows the notes list for manual selection

#### Scenario: LLM fails (returns null)

- GIVEN the LLM returns null (cannot parse or internal error)
- WHEN `handleRawTask()` receives null from `timeParser.execute()`
- THEN it falls back to showing the notes menu
- AND task creation is NOT attempted

### Requirement: Existing State Machine Preservation

The system MUST NOT modify existing `waiting_note_*` state machine contexts. The create flow (`waiting_note_title` → `waiting_note_content` → `waiting_note_image_confirm` → `waiting_note_image`) and update flow (`waiting_note_update_select` → `waiting_note_update_content` → `waiting_note_update_image` → `waiting_note_update_image_send`) SHALL remain identical. Media routing in `AstralFeature.ts` SHALL stay unchanged.

#### Scenario: Image attachment after NLP create

- GIVEN a note was created via NLP with content
- AND the system prompts "¿Querés adjuntar una imagen?"
- WHEN the user says "sí"
- THEN the system transitions to `waiting_note_image` (same state as manual create flow)
- AND `AstralFeature.ts` handles the incoming media identically
