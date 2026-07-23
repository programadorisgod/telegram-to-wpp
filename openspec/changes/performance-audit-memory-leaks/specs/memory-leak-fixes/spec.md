# Memory Leak Fixes Specification

## Purpose

Prevent unbounded memory growth in all in-memory collections by implementing TTL-based cleanup and proper lifecycle management.

## Requirements

### Requirement: TTL-Based Cache Cleanup

All in-memory collections (Maps, Sets, Arrays) used for caching or tracking MUST implement automatic cleanup based on time-to-live (TTL) or maximum size with LRU eviction.

#### Scenario: ConversationStateMachine cleans up stale user states

- GIVEN a user state has not been updated for more than 30 minutes
- WHEN any state machine operation occurs
- THEN the stale user state MUST be removed from the internal Map
- AND the cleanup MUST NOT block the calling operation

#### Scenario: BaileysClient message caches enforce LRU eviction

- GIVEN processedMessageIds, recentBodies, recentSends, or sentMessages exceeds MAX_CACHED_ITEMS
- WHEN a new entry is added
- THEN the oldest entries MUST be removed to maintain the size limit
- AND the eviction MUST use O(1) operations (no full iteration + array slicing)

#### Scenario: TelegramBridgeService cleans up zombie sessions

- GIVEN an active session has not sent or received a message for more than 15 minutes
- WHEN the bridge service checks active sessions
- THEN the zombie session MUST be automatically removed from activeSessions Set

#### Scenario: NodeCronScheduler cleans up failed job entries

- GIVEN a reminder callback throws an exception
- WHEN the timeout fires
- THEN the job entry MUST still be removed from the jobs Map
- AND the error MUST be logged without preventing cleanup

### Requirement: Configurable TTL Values

TTL values for all caches MUST be configurable via environment variables with sensible defaults.

#### Scenario: Default TTL values are applied when env vars are not set

- GIVEN no TTL environment variables are configured
- WHEN the application starts
- THEN default TTLs MUST be applied: userStates=30min, sessions=15min, messageCaches=5min

#### Scenario: Custom TTL values override defaults

- GIVEN TTL_CACHE_USER_STATES=600000 is set in environment
- WHEN the ConversationStateMachine initializes
- THEN the user state TTL MUST be 10 minutes (600000ms)

### Requirement: Memory Usage Monitoring

The system MUST expose a method to report current memory usage of all tracked collections.

#### Scenario: Memory report returns collection sizes

- WHEN getMemoryReport() is called
- THEN it MUST return an object with sizes of: userStates, processedMessageIds, recentBodies, recentSends, sentMessages, activeSessions, scheduler jobs
- AND the report MUST NOT modify any collection
