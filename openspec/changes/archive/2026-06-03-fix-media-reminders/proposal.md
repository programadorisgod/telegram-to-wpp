# Proposal: Fix Media Reminder Bugs

## Intent

Fix three bugs in the WhatsApp reminder bot's media handling:
1. **Image captions ignored** — `message.caption` is never read, so NLP never parses time expressions from image captions, falling back to 00:00
2. **Media orphaned in Supabase** — file deletion lives inside a try block; if send fails, delete never runs. Rejected audio confirmations also leak files
3. **Images without captions create orphan records** — image is saved to Supabase but no Task is created, so no reminder fires and the image is never returned

## Scope

### In Scope
- Read `message.caption` in BaileysClient for media messages, pass to NLP parser
- Reject images when caption has no valid parseable time (no orphan tasks)
- Move `fileStorage.delete()` to finally block in reminder callback (main.ts)
- Delete uploaded audio file when user rejects confirmation
- Ensure `SupabaseFileStorage.delete()` throws on error instead of silent logging

### Out of Scope
- Adding test infrastructure (no test runner exists)
- Refactoring overall media handling architecture
- Database cleanup of existing orphan records
- OCR improvements (separate concern)

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `image-reminder`: Caption text must pass through NLP; reject when no valid time parsed; no orphan image-only records
- `audio-reminder`: Uploaded audio must be deleted when user rejects confirmation and when reminder fires

## Approach

1. **BaileysClient** — add `message.caption` check alongside `message.body` for media messages. Pass caption text to `incomingMediaHandler` so `handleImage` receives it for NLP parsing
2. **main.ts** — wrap media send + delete in try/finally so deletion runs regardless of send success
3. **AstralController audio rejection** — store uploaded URL in state, delete from Supabase when user says "No"
4. **AstralController image handling** — when caption exists but NLP returns nothing, reject with helpful message instead of saving orphan image
5. **SupabaseFileStorage** — throw on delete errors so callers can handle failures

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modified | Read `message.caption` for media captions, pass to handler |
| `src/main.ts` | Modified | Move `fileStorage.delete()` to finally block |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modified | Reject images without valid time; clean rejected audio |
| `src/infrastructure/storage/SupabaseFileStorage.ts` | Modified | Throw on delete errors instead of silent console.error |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing media flow | Low | Caption field is additive; body fallback preserved |
| Deleting files that failed to send | Medium | Acceptable tradeoff — orphan files are worse than re-uploads |
| Users sending images without captions | Low | Clear rejection message guides them to use valid time |

## Rollback Plan

Revert the 4 changed files. No database migrations or config changes involved.

## Dependencies

None

## Success Criteria

- [ ] Image with "en 2 minutos" caption schedules reminder for correct time
- [ ] Audio files deleted from Supabase after reminder fires
- [ ] Audio files deleted when user rejects confirmation
- [ ] Images without valid time are rejected with helpful message
- [ ] Image files deleted from Supabase after reminder fires
- [ ] No orphan images in Supabase from unparseable captions
