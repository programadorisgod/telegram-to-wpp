# Delta for Media Cleanup

## ADDED Requirements

### Requirement: Stream-Based Media Operations

Media download and upload operations SHOULD use Node.js streams when the target API supports it, to reduce peak memory usage. The deletion guarantees and orphan prevention requirements remain unchanged.

#### Scenario: Media is downloaded via stream

- GIVEN a reminder fires with a media URL
- WHEN the media is downloaded
- THEN a stream SHOULD be used instead of loading the entire file into a Buffer
- AND the media MUST still be deleted after the reminder fires (unchanged requirement)

#### Scenario: Fallback to buffer when stream is not supported

- GIVEN the target API (e.g., whatsapp-web.js) does not accept streaming input
- WHEN a stream-based download completes
- THEN the stream MUST be collected into a buffer as fallback
- AND the behavior MUST be identical to the previous buffer-only approach
