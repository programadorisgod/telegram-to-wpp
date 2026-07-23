# Audio Reminder Specification

## Purpose

Define audio-based reminder creation: duration validation, Groq whisper-large-v3 transcription, and persistence of the transcribed text as the reminder body.

## Requirements

### Requirement: Audio Reception

The system MUST detect audio attachments (PTA/Opus), download the media, validate duration, and route to transcription.

#### Scenario: Valid audio received

- GIVEN an incoming message with audio attachment ≤20s duration
- WHEN the system processes the message
- THEN the audio is downloaded to a temp file
- AND transcription begins

#### Scenario: Audio exceeds max duration

- GIVEN an audio message >20s
- WHEN the system validates duration
- THEN the system SHALL reject with "El audio es demasiado largo (máx 20 segundos)" and return

#### Scenario: Audio near limit (≤15s)

- GIVEN an audio message ≤15s
- WHEN the system processes it
- THEN it proceeds without warning — this is the recommended maximum

### Requirement: Duration Validation

The system MUST validate audio duration before sending to Groq API to avoid unnecessary API calls. Audio between 15s and 20s SHOULD proceed but is accepted.

#### Scenario: Duration check before API call

- GIVEN audio duration is validated at ≤20s
- WHEN the check passes
- THEN the Groq API is called
- AND costs are incurred only for valid audio

#### Scenario: Duration check prevents API call

- GIVEN audio duration >20s
- WHEN duration validation fails
- THEN the system returns early — no Groq API call is made
- AND no cost is incurred

### Requirement: Groq Transcription

The system MUST send audio to Groq whisper-large-v3 and return the transcribed text. The API key MUST be read from `AUDIO_GROQ_API_KEY` env var and never logged.

#### Scenario: Successful transcription

- GIVEN a valid audio file ≤20s
- WHEN the Groq API responds
- THEN the transcribed text is returned as a string

#### Scenario: Groq API error

- GIVEN the Groq API returns an error (network, auth, rate limit)
- WHEN the transcription service handles it
- THEN the system SHALL respond with "No se pudo transcribir el audio. Intenta de nuevo."
- AND the error is logged at `error` level without exposing the API key

### Requirement: Audio Persistence

The transcribed text MUST be persisted alongside a reference to the original audio file stored in Supabase Storage.

#### Scenario: Store with audio reference

- GIVEN transcription succeeds
- WHEN the reminder is created
- THEN the audio is uploaded to Supabase Storage
- AND the reminder record references the stored audio URL

### Requirement: Resource Cleanup

Temp audio files MUST be deleted after transcription completes or fails.

#### Scenario: Cleanup after success

- GIVEN transcription completes (success or failure)
- WHEN cleanup runs
- THEN the temp audio file is deleted

## Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NF1 | Cost | Duration validation MUST run before any API call. No Groq charges for >20s audio. |
| NF2 | Security | `AUDIO_GROQ_API_KEY` MUST NOT appear in logs, error messages, or debug output. |
| NF3 | Performance | Transcription for ≤15s audio SHOULD complete within 10s (network-dependent). |

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty/silent audio | Groq returns empty string; system warns "No se detectó voz en el audio" |
| Audio with background noise | Groq returns best-effort transcription; no special handling needed |
| Unsupported audio codec | System rejects with "Formato de audio no soportado" |
