# Image Reminder Specification

## Purpose

Define image-based reminder creation: OCR text extraction via tesseract.js, validation, and persistence with the extracted content as the reminder body.

## Requirements

### Requirement: Image Reception

The system MUST detect image attachments in incoming WhatsApp messages, download the media, validate file size, and route to OCR processing.

#### Scenario: Valid image received

- GIVEN an incoming message with an image attachment (≤1MB)
- WHEN the system processes the message
- THEN the image is downloaded to a temp file
- AND OCR processing begins

#### Scenario: Image exceeds size limit

- GIVEN an incoming image >1MB
- WHEN the system validates file size
- THEN the system SHALL reject with "La imagen es demasiado grande (máx 1MB)" and return

### Requirement: OCR Processing

The system MUST extract text from the image using tesseract.js with Spanish language support (`spa`).

#### Scenario: Text extracted successfully

- GIVEN a valid image with legible text
- WHEN OCR processes the image
- THEN extracted text with confidence score is returned

#### Scenario: No text found

- GIVEN an image with no detectable text regions
- WHEN OCR completes with empty result
- THEN the system SHALL notify "No se encontró texto en la imagen" and NOT create a reminder
- AND the temp file is cleaned up

#### Scenario: OCR confidence too low

- GIVEN OCR returns text with confidence below threshold (e.g., <60%)
- WHEN validation runs
- THEN the system SHOULD warn "El texto detectado tiene baja calidad" and still proceed

### Requirement: OCR Sanitization

The system MUST sanitize OCR output — trim whitespace, collapse repeated whitespace, strip non-printable characters.

#### Scenario: Sanitized output

- GIVEN OCR returns "  Hola  \n  Mundo  " with extra whitespace
- WHEN sanitization runs
- THEN the result is "Hola Mundo"

### Requirement: Resource Management

Each tesseract.js worker SHALL be instantiated for a single OCR job and disposed immediately after.

#### Scenario: Single-use worker

- GIVEN an OCR job completes or fails
- WHEN cleanup runs
- THEN `worker.terminate()` is called
- AND temp files are deleted

### Requirement: Image Persistence

The extracted text MUST be persisted alongside a reference to the original image stored in Supabase Storage.

#### Scenario: Store with image reference

- GIVEN OCR succeeds with extracted text
- WHEN the reminder is created
- THEN the image is uploaded to Supabase Storage
- AND the reminder record references the stored image URL

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Cost | OCR MUST NOT run on non-image attachments (audio, video, documents). |
| NF2 | Memory | Only one tesseract.js worker SHALL exist at any time. Dispose after each job. |
| NF3 | Performance | OCR SHOULD complete within 10s for images ≤1MB on a Raspberry Pi 4. |

## Edge Cases

| Case | Behavior |
|------|----------|
| Corrupt/invalid image file | System rejects with "No se pudo procesar la imagen" |
| Image with small text | OCR runs normally — quality depends on tesseract.js capabilities |
