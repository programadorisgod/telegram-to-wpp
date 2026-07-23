# Tasks: Fix Media Reminder Bugs

## Phase 1: Foundation — SupabaseFileStorage Error Handling

- [x] **1.1 Make `SupabaseFileStorage.delete()` throw on error instead of silent logging**
  - **File:** `src/infrastructure/storage/SupabaseFileStorage.ts` (lines ~160-173)
  - **What:** Currently the `delete()` method catches errors and logs them silently; change it to re-throw so callers can detect and handle failures. If the file doesn't exist (404), treat it as success (idempotent delete — no-op).
  - **Edge case:** `SupabaseStorageError` vs generic `Error` — throw a typed error so callers can differentiate.
  - **Test:** Unit test that `delete()` throws on network/auth errors and succeeds on 404.

## Phase 2: Caption Parsing — BaileysClient + NLP

- [x] **2.1 Extract `message.caption` from image messages in BaileysClient**
  - **File:** `packages/whatsapp-core/src/client/BaileysClient.ts` (lines ~184-198, ~255-270)
  - **What:** In the image message handler, read `msg.message?.imageMessage?.caption` and store it in the intermediate processing payload alongside OCR text.
  - **Conditions:**
    - If `caption` is present and non-empty → pass to NLP parser (takes precedence over OCR).
    - If `caption` is absent or empty string → fall back to OCR-only flow (current behavior).
  - **Test:** Unit test with a fake Baileys message containing caption; verify payload includes caption field.

- [x] **2.2 Wire caption text to the NLP parser before OCR fallback**
  - **File:** `packages/whatsapp-core/src/client/BaileysClient.ts` — pipeline orchestration where `task-nlp` is called
  - **What:** If caption text exists, call `task-nlp.parse()` with caption first. If NLP returns a valid time, skip OCR entirely (caption takes precedence per NF2). If NLP returns null time, fall back to OCR text as a second attempt.
  - **Test:** Mock NLP — verify OCR is NOT called when caption parses a valid time; verify OCR IS called when caption yields null.

- [x] **2.3 Reject images without valid time from caption or OCR**
  - **File:** `src/interface/whatsapp/features/astral/AstralController.ts` (lines ~696-703, `handleImage`)
  - **What:** After NLP parsing (caption + OCR fallback), if no valid time is extracted:
    - Do NOT upload image to Supabase.
    - Do NOT create a Task record.
    - Reply with guidance message: "No pude entender el horario en el mensaje. Usá un formato como 'mañana a las 3pm' o 'en 10 minutos'."
  - **Edge cases:**
    - Caption with only a date (no time) → valid per spec (time: null is OK).
    - Caption with emojis/gibberish → NLP returns null time → reject.
  - **Test:** Integration test that an image message with unparseable caption does NOT produce a Task record or Supabase upload.

## Phase 3: Media Cleanup — AstralController

- [x] **3.1 Delete uploaded audio file on user rejection in `handleAudioConfirm`**
  - **File:** `src/interface/whatsapp/features/astral/AstralController.ts` (lines ~823-845)
  - **What:** When user responds "No" (or equivalent rejection) to an audio confirmation prompt, call `fileStorage.delete(audioPath)` before acknowledging the user. If the delete fails, log the error but still acknowledge the rejection (non-blocking cleanup).
  - **Test:** Mock `fileStorage.delete` — verify it is called on rejection; verify it is NOT called on acceptance.

## Phase 4: Integration — Guaranteed Cleanup on Reminder Fire

- [x] **4.1 Move `fileStorage.delete()` to a `finally` block in `main.ts` reminder callback**
  - **File:** `src/main.ts` (lines ~152-185)
  - **What:** Currently `fileStorage.delete()` is in the try block after send; move it to a `finally` block so media is always deleted regardless of send success or failure. Wrap the delete call itself in a try-catch so a deletion error doesn't crash the callback (logged at error level, reminder still marked).
  - **Conditions:**
    - Reminder fires + message sent OK → delete in finally, mark completed.
    - Reminder fires + send fails → delete in finally, mark failed, log error.
    - Delete throws → log error, reminder still marked per send outcome.
  - **Test:** Integration test simulating send failure — verify `delete` is called even after failure.

## Phase 5: Verification

- [x] **5.1 Run `tsc --noEmit` to verify no compilation errors**
  - Run from project root: `tsc --noEmit` or the configured build command.
  - Fix any type errors introduced by the changes.
  - **Confirm:** Zero type errors.

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Changed files | 4 (SupabaseFileStorage, BaileysClient, AstralController, main.ts) |
| Estimated lines changed | ~150-200 |
| Review budget | 800 lines (within budget) |
| Delivery | Single PR |