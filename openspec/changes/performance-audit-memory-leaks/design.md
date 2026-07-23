# Design: Performance Audit & Memory Leaks Fix

## Technical Approach

11 bloques ejecutados en orden de riesgo creciente. Cada bloque es un commit independiente. Sin nuevas dependencias externas — se usa pino (ya en deps), libsql concurrency nativa, y patrones de Node.js estándar.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Cache eviction | LRU array + shift vs Map + order tracking | Array shift is O(n), Map iteration is O(n) but cleaner | Map + manual LRU (delete oldest N entries) — matches existing pattern |
| TTL cleanup | setInterval polling vs lazy cleanup on access | setInterval adds timer overhead, lazy is zero-cost | Lazy cleanup on access + periodic sweep every 5min |
| State persistence | Sync write vs async fire-and-forget | Sync blocks hot path, async may lose last state on crash | Async fire-and-forget with error logging |
| Media streaming | Node ReadableStream vs whatsapp-web.js native | whatsapp-web.js only accepts base64 strings | Stream download → collect to base64 (whatsapp-web.js limitation) |
| Tesseract pool | worker_threads vs in-process pool | worker_threads isolates CPU but adds IPC overhead | In-process pool (Tesseract runs in WASM, not CPU-bound) |
| NLP cache key | raw input vs hash(input)+country | Raw input uses more memory, hash is constant size | SHA-256 hash of input + country code |
| Logger | pino vs winston vs custom | pino already in deps, fastest JSON logger | pino (existing dependency) |

## Data Flow

### Memory Leak Cleanup (Bloque 1)

```
Message arrives → StateMachine.setState()
    ├── Update in-memory Map
    ├── Lazy cleanup: remove entries > TTL
    └── Async: persist to DB (fire-and-forget)

WhatsApp message → BaileysClient caches
    ├── Add entry to Map/Set
    └── If size > MAX: delete oldest N entries (O(N) trim)

Reminder fires → NodeCronScheduler
    ├── setTimeout callback executes
    ├── try { fireReminder() } finally { cleanup entry }
    └── Error logged, entry always removed
```

### Controller Split (Bloque 2)

```
AstralController (145KB)
    ├── TaskController.ts        → task flows, NLP routing, reminders
    ├── NoteController.ts        → note CRUD, image handling, OCR
    ├── ProjectController.ts     → project CRUD, updates, history
    ├── AudioController.ts       → audio processing, transcription
    └── RegistrationController.ts → user registration, country selection

AstralFeature (unchanged) → delegates to controllers via composition
```

### API Timeout (Bloque 3)

```
Service.execute()
    ├── Create AbortController
    ├── setTimeout(abort, timeoutMs)
    ├── fetch(url, { signal: controller.signal })
    ├── clearTimeout on success
    └── Catch AbortError → log timeout, return user-friendly error
```

### NLP Cache (Bloque 7)

```
TimeParserService.execute(text, country)
    ├── key = sha256(text) + ":" + country
    ├── if cache.has(key) && !expired → return cached
    ├── else → call AI service
    ├── cache.set(key, result, ttl)
    └── if cache.size > maxSize → evict oldest
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/infrastructure/config/env.ts` | Modify | Add timeout, TTL, pool size env vars |
| `src/infrastructure/logger.ts` | **Create** | Pino logger factory with levels and context |
| `src/interface/whatsapp/ConversationStateMachine.ts` | Modify | TTL cleanup + async DB snapshot |
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modify | LRU caches + TTL + stream media download |
| `src/application/services/TelegramBridgeService.ts` | Modify | TTL for activeSessions with zombie cleanup |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Modify | try/finally in callbacks + error handling |
| `src/interface/whatsapp/features/astral/TaskController.ts` | **Create** | Task flows extracted from AstralController |
| `src/interface/whatsapp/features/astral/NoteController.ts` | **Create** | Note flows extracted from AstralController |
| `src/interface/whatsapp/features/astral/ProjectController.ts` | **Create** | Project flows extracted from AstralController |
| `src/interface/whatsapp/features/astral/AudioController.ts` | **Create** | Audio flows extracted from AstralController |
| `src/interface/whatsapp/features/astral/RegistrationController.ts` | **Create** | Registration flows extracted from AstralController |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modify | Becomes thin orchestrator delegating to sub-controllers |
| `src/infrastructure/transcription/GroqTranscriptionService.ts` | Modify | AbortController with timeout |
| `src/infrastructure/storage/SupabaseFileStorage.ts` | Modify | AbortController + stream support |
| `src/application/use-cases/astral/TimeParserService.ts` | Modify | LRU cache wrapper around execute() |
| `src/infrastructure/ocr/TesseractOcrService.ts` | Modify | Worker pool with configurable size |
| `packages/db-core/src/factory.ts` | Modify | libsql concurrency option |
| `src/application/use-cases/astral/ReminderScheduler.ts` | Modify | Parallel re-registration with chunking |
| `src/main.ts` | Modify | Pino init + parallel re-register |
| `src/infrastructure/db/schema/user_states.ts` | **Create** | Drizzle schema for persistent state |

## Interfaces / Contracts

### TTLCache Utility

```typescript
interface TTLCacheOptions {
  ttlMs: number;
  maxSize: number;
  cleanupIntervalMs?: number;
}

class TTLCache<K, V> {
  constructor(opts: TTLCacheOptions);
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  get size(): number;
  get stats(): { hits: number; misses: number; hitRate: number };
  cleanup(): number; // returns removed count
}
```

### Logger Interface

```typescript
interface AppLogger {
  info(ctx: Record<string, unknown>, msg: string): void;
  warn(ctx: Record<string, unknown>, msg: string): void;
  error(ctx: Record<string, unknown>, msg: string): void;
  debug(ctx: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): AppLogger;
}
```

### Persistent State Schema

```typescript
// src/infrastructure/db/schema/user_states.ts
export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  context: text("context").notNull(),
  data: text("data").notNull(), // JSON string
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

## Testing Strategy

No test framework installed. Manual verification plan:

| Block | Verify | How |
|-------|--------|-----|
| Memory leaks | Heap snapshot stable | Run bot, send 100 messages, compare heap before/after |
| Controller split | All flows work | Manual test: create task, note, project, audio, register |
| Timeouts | API hangs don't block | Mock slow API, verify timeout fires and user sees error |
| Logger | Structured output | Check logs are JSON with correct levels |
| NLP cache | Cache hits | Send same message twice, second should be instant |
| Parallel reminders | Boot time < 2s | Add 50 tasks to DB, restart, measure re-registration time |
| Persistent state | Survives restart | Set state, kill process, restart, verify state restored |

## Migration / Rollout

No migration required. All changes are backward compatible:
- TTL values default to behavior similar to current (no cleanup = infinite TTL)
- Controller split preserves all context strings and routing
- Timeouts default to 30s (longer than any expected API call)
- Logger replaces console.log 1:1
- State persistence is additive (memory still works if DB fails)

## Open Questions

- None — all decisions resolved by existing patterns and constraints
