# API Timeouts Specification

## Purpose

Prevent indefinite blocking of the event loop when external APIs (Groq, Supabase, AI service) are slow or unresponsive by enforcing configurable timeouts on all outbound HTTP calls.

## Requirements

### Requirement: All External API Calls Must Have Timeouts

Every fetch() call to an external service MUST include an AbortController with a configurable timeout.

#### Scenario: Groq transcription times out after configured limit

- GIVEN GROQ_TIMEOUT_MS=15000 is configured
- WHEN a transcription request takes longer than 15 seconds
- THEN the request MUST be aborted
- AND the error message MUST indicate a timeout (not a generic API error)
- AND the user MUST receive a friendly error message

#### Scenario: Supabase upload times out after configured limit

- GIVEN SUPABASE_TIMEOUT_MS=30000 is configured
- WHEN a file upload to Supabase takes longer than 30 seconds
- THEN the request MUST be aborted
- AND the local fallback MUST be attempted if enabled

#### Scenario: AI service call times out after configured limit

- GIVEN AI_TIMEOUT_MS=30000 is configured
- WHEN an NLP parsing request takes longer than 30 seconds
- THEN the request MUST be aborted
- AND the regex fallback MUST be used if available

### Requirement: Timeout Configuration via Environment Variables

Each external service MUST have its own configurable timeout via environment variable with sensible defaults.

#### Scenario: Default timeouts are applied when env vars are not set

- GIVEN no timeout environment variables are configured
- WHEN the application starts
- THEN defaults MUST be: GROQ=15s, SUPABASE=30s, AI=30s, HTTP_CLIENT_API=10s

#### Scenario: Individual timeouts can be customized

- GIVEN GROQ_TIMEOUT_MS=5000 is set
- WHEN a Groq transcription is initiated
- THEN the timeout MUST be 5 seconds

### Requirement: Timeout Errors Are Distinguishable from Other Errors

Timeout errors MUST be logged and reported differently from network errors or API errors.

#### Scenario: Timeout error includes timing information

- GIVEN a Groq request times out after 15 seconds
- WHEN the error is logged
- THEN the log entry MUST include: level="error", msg, service="groq", timeout_ms=15000, elapsed_ms≈15000

#### Scenario: Retry is NOT attempted on timeout

- GIVEN a request times out
- WHEN the error is handled
- THEN the system MUST NOT automatically retry the request
- AND the user MUST be informed to try again later
