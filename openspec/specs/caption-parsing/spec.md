# Caption Parsing Specification

## Purpose

Define how image caption text is extracted from media messages and passed through the NLP parser for time extraction, preventing orphan image records when no valid time can be parsed.

## Requirements

### Requirement: Caption Extraction

The system MUST read `message.caption` from incoming image messages and pass the caption text to the NLP parser alongside any OCR-extracted text. Caption text takes precedence over OCR text for time extraction.

#### Scenario: Image with caption text

- GIVEN an incoming image message with caption "recordarme en 2 minutos"
- WHEN the system processes the message
- THEN the caption text is extracted and passed to the NLP parser
- AND the caption is used for time extraction

#### Scenario: Image without caption

- GIVEN an incoming image message with no caption field
- WHEN the system processes the message
- THEN the system falls back to OCR text extraction only
- AND no caption text is passed to the NLP parser

#### Scenario: Image with empty caption

- GIVEN an incoming image message with caption as empty string
- WHEN the system processes the message
- THEN the system treats it as no caption and falls back to OCR only

### Requirement: NLP Parsing of Caption

The system MUST pass caption text through the existing NLP parser (task-nlp) to extract date and time references.

#### Scenario: Valid time in caption

- GIVEN caption text "reunión mañana a las 3pm"
- WHEN the NLP parser processes the caption
- THEN it returns `{ date: tomorrow, time: "15:00", description: "reunión" }`

#### Scenario: No valid time in caption

- GIVEN caption text "mirá esta foto" with no temporal reference
- WHEN the NLP parser processes the caption
- THEN it returns `{ time: null }` — no valid time extracted

#### Scenario: Unparseable text in caption

- GIVEN caption text containing only emojis or non-Spanish gibberish
- WHEN the NLP parser processes the caption
- THEN it returns `{ time: null, date: today, description: <full caption> }` as fallback

### Requirement: Reject Images Without Valid Time

The system MUST NOT create a reminder or persist the image to Supabase when the caption (and OCR fallback) yields no valid parseable time. The system SHALL respond with a helpful message explaining the issue.

#### Scenario: Image with valid time caption

- GIVEN caption "en 5 minutos comprar pan" parses to time "current+5min"
- WHEN the reminder is created
- THEN the image is uploaded to Supabase and the reminder is scheduled

#### Scenario: Image without caption and no OCR text

- GIVEN an image with no caption and OCR returns empty text
- WHEN processing completes
- THEN the system responds "No se encontró texto ni descripción en la imagen. Incluí un horario en el mensaje."
- AND no image is uploaded to Supabase
- AND no reminder record is created

#### Scenario: Image with unparseable caption

- GIVEN caption "asdfgh jklñ" with no temporal reference
- WHEN the NLP parser returns no valid time
- THEN the system responds "No pude entender el horario en el mensaje. Usá un formato como 'mañana a las 3pm' o 'en 10 minutos'."
- AND no image is uploaded to Supabase
- AND no reminder record is created

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Performance | Caption extraction MUST NOT add latency — it is a direct field read. |
| NF2 | Priority | Caption text MUST be attempted before OCR — cheaper and faster. |
| NF3 | Locale | NLP parsing targets Spanish only, consistent with task-nlp spec. |

## Edge Cases

| Case | Behavior |
|------|----------|
| Caption + OCR both present | Caption used for time; OCR text used as description fallback |
| Caption with only date, no time | Reminder scheduled with `time: null` (valid — time is optional) |
| Very long caption (>200 chars) | NLP parser processes normally; performance budget from task-nlp applies |
