# Media Cleanup Specification

## Purpose

Define the lifecycle management of media files stored in Supabase — ensuring files are deleted after reminder fires, when user rejects confirmation, and that orphan records are never created.

## Requirements

### Requirement: Media Deletion After Reminder Fires

The system MUST delete the media file from Supabase Storage after the reminder fires, regardless of whether the message send succeeds or fails. Deletion MUST occur in a finally block or equivalent guarantee.

#### Scenario: Reminder fires successfully

- GIVEN a scheduled reminder with an associated image/audio file in Supabase
- WHEN the reminder fires and the message is sent successfully
- THEN the media file is deleted from Supabase Storage
- AND the reminder record is marked as completed

#### Scenario: Reminder fires with send failure

- GIVEN a scheduled reminder with an associated media file in Supabase
- WHEN the reminder fires but the message send fails (network error, user blocked bot)
- THEN the media file is STILL deleted from Supabase Storage
- AND the failure is logged at error level
- AND the reminder record is marked as failed

#### Scenario: Delete operation fails

- GIVEN the reminder fires and media deletion is attempted
- WHEN `SupabaseFileStorage.delete()` throws an error
- THEN the error is logged at error level
- AND the reminder record is still marked as completed/failed per send outcome

### Requirement: Media Deletion on Audio Rejection

The system MUST delete the uploaded audio file from Supabase Storage when the user rejects the audio confirmation (responds "No" or equivalent).

#### Scenario: User rejects audio confirmation

- GIVEN an audio file has been uploaded to Supabase and confirmation is pending
- WHEN the user responds with rejection ("No", "no quiero", etc.)
- THEN the uploaded audio file is deleted from Supabase Storage
- AND no reminder record is created
- AND the user is acknowledged with a confirmation message

#### Scenario: User accepts audio confirmation

- GIVEN an audio file has been uploaded to Supabase and confirmation is pending
- WHEN the user responds with acceptance ("Sí", "dale", etc.)
- THEN the audio file remains in Supabase until the reminder fires
- AND the reminder is scheduled normally

### Requirement: No Orphan Tasks for Images Without Valid Time

The system MUST NOT create a Task record or upload an image to Supabase when the caption/OCR yields no valid parseable time. Image upload and task creation are atomic — both happen or neither happens.

#### Scenario: Image without valid time

- GIVEN an image with caption that NLP cannot parse for time
- WHEN processing completes
- THEN no Task record is created in the database
- AND no image is uploaded to Supabase Storage
- AND the user receives a rejection message with guidance

#### Scenario: Image with valid time

- GIVEN an image with caption "mañana a las 10am reunión"
- WHEN NLP parsing succeeds
- THEN the image is uploaded to Supabase
- AND a Task record is created referencing the stored image URL
- AND the reminder is scheduled

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Reliability | Media deletion MUST NOT be inside a try block that can skip on send failure. |
| NF2 | Storage | Orphan files in Supabase MUST NOT accumulate — every upload has a guaranteed deletion path. |
| NF3 | Error handling | `SupabaseFileStorage.delete()` MUST throw on error instead of silent logging, so callers can handle failures. |

## Edge Cases

| Case | Behavior |
|------|----------|
| File already deleted (idempotent delete) | Delete call is safe to call multiple times; no error thrown |
| Reminder deleted before firing | Associated media deleted as part of reminder deletion cascade |
| Concurrent delete attempts | Supabase handles gracefully; second delete is a no-op |
