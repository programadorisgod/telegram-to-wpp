# Media Streaming Specification

## Purpose

Reduce peak memory usage during media operations by using Node.js streams instead of loading entire files into memory as buffers.

## Requirements

### Requirement: Media Downloads Use Streams

All media downloads from external URLs MUST use streaming instead of loading the complete response into a Buffer.

#### Scenario: Reminder media is streamed to WhatsApp

- GIVEN a reminder fires with a media URL from Supabase
- WHEN the media is downloaded
- THEN the download MUST use a stream (not arrayBuffer + Buffer.from)
- AND the media MUST be sent to WhatsApp without holding the full file in memory

#### Scenario: Telegram incoming media is streamed

- GIVEN a media file is received from Telegram
- WHEN the file is downloaded via getFileLink
- THEN the download MUST use a stream
- AND the base64 conversion MUST process chunks incrementally

### Requirement: Fallback to Buffer When Streaming Is Not Supported

If the target service does not support streaming input, the system MUST fall back to buffer mode with a warning log.

#### Scenario: whatsapp-web.js requires buffer for sendMedia

- GIVEN whatsapp-web.js sendMessage API requires a base64 string
- WHEN streaming is attempted
- THEN the system MUST collect the stream into a buffer as fallback
- AND a debug log MUST note that streaming was not possible for this target

### Requirement: Large Media Files Are Rejected Early

Files exceeding a configured size limit MUST be rejected before download begins.

#### Scenario: Media size is checked via Content-Length header

- GIVEN MAX_MEDIA_SIZE_MB=10 is configured
- WHEN a media download is initiated
- THEN the Content-Length header MUST be checked
- AND if the file exceeds 10MB, the download MUST be aborted
- AND the user MUST receive an error message about file size
