# Structured Logging Specification

## Purpose

Replace unstructured console.log/console.error calls with structured logging using pino, enabling log levels, context, and machine-readable output.

## Requirements

### Requirement: Structured Log Format

All application logging MUST use pino with structured JSON output, including timestamp, level, message, and contextual fields.

#### Scenario: Message handler logs with context

- GIVEN a WhatsApp message is received from sender "5491112345678"
- WHEN the message is processed
- THEN the log entry MUST include: level, msg, sender, context (state machine context), duration_ms

#### Scenario: Error logs include stack traces

- GIVEN an error occurs during audio transcription
- WHEN the error is logged
- THEN the log entry MUST include: level="error", msg, error stack, userId, audioFileName

#### Scenario: Different log levels are used appropriately

- GIVEN various events occur (info, warnings, errors)
- WHEN they are logged
- THEN info events (message received, reminder fired) use level="info"
- AND warnings (deprecated config, cache miss) use level="warn"
- AND errors (API failure, DB error) use level="error"
- AND debug details (raw API response, SQL query) use level="debug"

### Requirement: Log Level Configuration

The application MUST support configurable log levels via environment variable.

#### Scenario: Production uses info level by default

- GIVEN NODE_ENV=production
- WHEN the logger initializes
- THEN the log level MUST be "info"

#### Scenario: Development uses debug level

- GIVEN NODE_ENV=development
- WHEN the logger initializes
- THEN the log level MUST be "debug"

#### Scenario: Custom log level overrides environment default

- GIVEN LOG_LEVEL=warn is set
- WHEN the logger initializes
- THEN only "warn", "error", and "fatal" level logs MUST be output

### Requirement: No console.log in Production Code

All source files under src/ and packages/*/src/ MUST NOT use console.log, console.error, console.warn, or console.info for application logging.

#### Scenario: console methods are replaced with pino equivalents

- GIVEN an existing file uses console.log("[MESSAGE] De: 5491112345678")
- WHEN the file is migrated
- THEN it MUST use logger.info({ sender: "5491112345678" }, "Message received")

#### Scenario: console.log is only allowed in startup scripts

- GIVEN a file under scripts/ directory
- WHEN console.log is used
- THEN it MUST be allowed (startup scripts may use console for boot messages)
