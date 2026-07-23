# Proposal: Performance Audit & Memory Leaks Fix

## Intent

El bot de recuerdos tiene múltiples problemas de performance y memory leaks que degradan la estabilidad en producción: event loop bloqueado por operaciones sincrónicas, God Object de 145KB, scheduler basado en setTimeout sin persistencia, buffers de media sin streaming, caches sin TTL ni cleanup, y state machine volátil. Este cambio compacta y organiza todas las mejoras en bloques ejecutables.

## Scope

### In Scope
- **Bloque 1**: Fix memory leaks (ConversationStateMachine, BaileysClient caches, TelegramBridge sessions, scheduler jobs)
- **Bloque 2**: Desacoplar AstralController (145KB → 5 controllers por dominio)
- **Bloque 3**: Timeout en todas las APIs externas (Groq, Supabase, AI service)
- **Bloque 4**: Logger estructurado con pino (reemplazar console.log)
- **Bloque 5**: Stream media en vez de buffer completo
- **Bloque 6**: Connection pool para DB (libsql concurrency)
- **Bloque 7**: Cache NLP con LRU
- **Bloque 8**: Reutilizar workers Tesseract (pool)
- **Bloque 9**: Invalidación TTL para contactsCache
- **Bloque 10**: Paralelizar re-registro de reminders
- **Bloque 11**: State machine persistente (snapshot a DB)

### Out of Scope
- Worker queue con worker_threads para mensajes (requiere infra adicional, se deja para cambio separado)
- Reemplazar setTimeout scheduler por Bull/Redis (requiere Redis, se deja para cambio separado)

## Capabilities

### New Capabilities
- `memory-leak-fixes`: TTL-based cleanup para todos los caches y collections in-memory
- `structured-logging`: Reemplazo de console.log por pino con niveles y contexto
- `api-timeouts`: AbortController con timeout configurable en todas las llamadas externas
- `media-streaming`: Descarga y envío de media via streams en vez de buffers completos
- `nlp-cache`: LRU cache de respuestas AI por hash del input + país
- `tesseract-pool`: Pool de workers Tesseract reutilizables
- `persistent-state-machine`: Snapshot de ConversationStateMachine a DB Turso
- `parallel-reminders`: Re-registro paralelo de reminders con Promise.allSettled + chunking

### Modified Capabilities
- `task-crud`: AstralController desacoplado — los handlers de tareas van a TaskController separado
- `media-cleanup`: SupabaseFileStorage usa streams en vez de buffers completos

## Approach

Cada bloque es un commit independiente con tests de regresión. El orden de ejecución es:

1. **Bloque 1** (memory leaks) → Fix de bajo riesgo, alto impacto, sin breaking changes
2. **Bloque 2** (desacoplar controller) → Refactor mecánico, sin cambio de comportamiento
3. **Bloque 3** (timeouts) → Agregar AbortController a fetch calls existentes
4. **Bloque 4** (logger) → Reemplazar console.log por pino (ya en dependencias)
5. **Bloque 5** (stream media) → Cambiar Buffer.from por streams en BaileysClient y reminder callback
6. **Bloque 6** (DB pool) → Configurar concurrency en libsql client
7. **Bloque 7** (NLP cache) → Agregar LRU cache wrapper alrededor de timeParser.execute
8. **Bloque 8** (Tesseract pool) → Pool de workers con tamaño configurable
9. **Bloque 9** (contactsCache TTL) → Agregar timestamp de expiración
10. **Bloque 10** (parallel reminders) → Promise.allSettled con chunks de 10
11. **Bloque 11** (persistent state) → Snapshot a Turso después de cada transición

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/interface/whatsapp/ConversationStateMachine.ts` | Modified | TTL-based cleanup + snapshot a DB |
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modified | LRU caches con TTL + stream media |
| `src/application/services/TelegramBridgeService.ts` | Modified | TTL para activeSessions |
| `src/infrastructure/scheduler/NodeCronScheduler.ts` | Modified | try/finally en callbacks + snapshot |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Split → 5 files | TaskController, NoteController, ProjectController, AudioController, RegistrationController |
| `src/infrastructure/transcription/GroqTranscriptionService.ts` | Modified | AbortController con timeout |
| `src/infrastructure/storage/SupabaseFileStorage.ts` | Modified | AbortController + stream support |
| `src/application/use-cases/astral/TimeParserService.ts` | Modified | LRU cache wrapper |
| `src/infrastructure/ocr/TesseractOcrService.ts` | Modified | Worker pool |
| `packages/db-core/src/factory.ts` | Modified | libsql concurrency config |
| `src/infrastructure/config/env.ts` | Modified | Nuevas vars de config (timeouts, pool size, cache size) |
| `src/main.ts` | Modified | Parallel re-register + pino logger init |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Split de AstralController rompe routing | Medium | Tests de regresión por cada handler, verificación de que todos los contextos del state machine siguen funcionando |
| Stream media incompatible con whatsapp-web.js | Medium | Fallback a buffer si stream falla |
| LRU cache de NLP devuelve respuestas stale | Low | TTL corto (5 min) + invalidación por país |
| Tesseract pool consume mucha RAM | Low | Pool size configurable (default 1) |
| Snapshot de state machine a DB añade latencia | Low | Async snapshot sin await en hot path |

## Rollback Plan

Cada bloque es un commit independiente. Para revertir:
1. `git revert <commit-hash>` por bloque
2. Si el split del controller rompe algo, revertir ese commit específicamente
3. Los cambios de config (timeouts, pool, cache) se pueden desactivar via env vars sin revertir código

## Dependencies

- pino ya está en dependencias (9.5.0)
- Turso ya configurado como DB principal
- No se requieren nuevas dependencias externas

## Success Criteria

- [ ] Zero memory leaks detectados en heap snapshot después de 1h de uso simulado
- [ ] AstralController < 5KB (split en 5 archivos)
- [ ] Todas las APIs externas con timeout configurable (default 30s)
- [ ] Media se envía con < 50MB de RAM peak (vs ~200MB actual)
- [ ] NLP cache hit rate > 30% en uso normal
- [ ] Re-registro de reminders < 2s para 100 tareas (vs ~15s actual)
- [ ] State machine sobrevive restart del proceso
