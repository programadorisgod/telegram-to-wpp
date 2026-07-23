# Delta for Media Cleanup

## ADDED Requirements

### Requirement: Domain-Specific Note Controller

Note-related handlers including image processing, OCR, and media lifecycle MUST be implemented in a dedicated `NoteController` class, separate from other domain controllers. The `NoteController` SHALL handle all note creation, listing, updating, image upload, image deletion, and OCR flows.

#### Scenario: NoteController handles note creation with image

- GIVEN a user enters note creation mode and sends an image
- WHEN the image is received
- THEN the `NoteController` MUST handle the entire flow: upload, OCR (if applicable), save note
- AND the media lifecycle (upload → use → delete) MUST be identical to the previous behavior

#### Scenario: NoteController handles note update with image replacement

- GIVEN a user enters note update mode and sends a new image
- WHEN the image is received
- THEN the `NoteController` MUST handle: delete old image, upload new image, update note
- AND all media deletion guarantees MUST remain unchanged

#### Scenario: All existing note contexts are preserved

- GIVEN the state machine has contexts like "astral::waiting_note_title", "astral::waiting_note_content", "astral::waiting_note_image", "astral::waiting_note_update_select"
- WHEN the controllers are split
- THEN all context strings MUST remain unchanged
- AND the state machine routing MUST work identically

#### Scenario: NoteController receives only note-related dependencies

- GIVEN the `NoteController` is instantiated
- WHEN dependencies are injected
- THEN it MUST receive only: `createNote`, `queryNotes`, `updateNote`, `deleteNoteImage`, `fileStorage`, `whatsappService`, `stateMachine`, `menuService`
- AND it MUST NOT receive task, project, audio, or registration dependencies
