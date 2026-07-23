# NLP Cache Specification

## Purpose

Cache AI-powered NLP parsing results to reduce redundant API calls for identical or similar inputs, improving response time and reducing API costs.

## Requirements

### Requirement: LRU Cache for NLP Responses

The TimeParserService MUST cache parsed results using an LRU (Least Recently Used) eviction strategy.

#### Scenario: Identical input returns cached result

- GIVEN user sends "comprar leche mañana a las 5pm" with country "AR"
- WHEN the same user sends the exact same message within the TTL window
- THEN the cached result MUST be returned immediately
- AND no AI API call MUST be made

#### Scenario: Cache key includes country for timezone accuracy

- GIVEN "mañana a las 5pm" is cached for country "AR"
- WHEN a user from country "MX" sends the same message
- THEN the cache MUST NOT return the AR result
- AND a new AI call MUST be made for the MX context

#### Scenario: Cache evicts least recently used entry when full

- GIVEN the cache is at maximum capacity (100 entries)
- WHEN a new unique input is parsed
- THEN the least recently used entry MUST be evicted
- AND the new entry MUST be added

### Requirement: Cache TTL Prevents Stale Results

Cached entries MUST expire after a configurable TTL to prevent stale timezone-dependent results.

#### Scenario: Entry expires after TTL

- GIVEN an entry was cached 10 minutes ago
- GIVEN NLP_CACHE_TTL_MS=300000 (5 minutes)
- WHEN the same input is received
- THEN the cache MUST return a miss
- AND a new AI call MUST be made

#### Scenario: TTL is configurable via environment

- GIVEN NLP_CACHE_TTL_MS=600000 is set
- WHEN the cache initializes
- THEN entries MUST expire after 10 minutes

### Requirement: Cache Statistics Are Exposed

The system MUST expose cache hit/miss statistics for monitoring.

#### Scenario: Cache stats are available on demand

- WHEN getCacheStats() is called
- THEN it MUST return: hits, misses, hitRate, size, maxSize
- AND hitRate MUST be calculated as hits / (hits + misses)
