# Design: send-reminder-to-contact

## Technical Approach

Insert 3 states (`waiting_recipient_choice` → `waiting_contact_search` → `waiting_contact_select`) after `waiting_reminder_config` in the Astral task flow. Contact search uses `whatsapp-web.js`'s `client.getContacts()` with in-memory cache and local case-insensitive filtering by name/pushname/number. The selected contact's `id._serialized` is stored as `scheduledFor` on the task entity and routed by the scheduler callback.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Where to search contacts | Local in-memory cache on BaileysClient | Per-keystroke API call | WhatsApp contacts don't change mid-session; cache once, search locally. Avoids Puppeteer overhead per query |
| How to pass contacts to controller | Delegate handler on WhatsAppService (existing pattern) | Direct dependency on BaileysClient | Follows existing setMessageSender/setMediaSender pattern — port/adapter boundary |
| Where to persist selected contact | `scheduled_for` column on tasks table | Separate recipient table | Simple 1:1 relation; nullable column = no destructive migration |
| Scheduler routing | `task.scheduledFor ?? task.userId` | Always use userId + override flag | Minimal change; fallback to sender for existing tasks (NULL = current behavior) |

## Data Flow

```
User ──→ [AstralController] ──→ [WhatsAppService.searchContacts(query)]
                                         │
                                         ↓
                                   [BaileysClient.searchContacts]
                                    ┌─────────────────────┐
                                    │ contactsCache (lazy) │
                                    │ ← getContacts()      │
                                    │ filter by name/      │
                                    │ pushname/number      │
                                    └─────────┬───────────┘
                                              │
                            IContactSearchResult[]
                                              │
User ←── [AstralController] ←── formatted list
    │  user picks number
    │
    └──→ data.recipientId = contact.id._serialized
         createTaskWithReminder({ recipientId })
              │
              ↓
         [CreateTaskFromNLP]
              │
              ↓
         [TursoTaskRepository.save()]
         scheduled_for = recipientId
              │
              ↓  (later, scheduler fires)
         [main.ts reminder callback]
         to = task.scheduledFor ?? task.userId
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/whatsapp-core/src/client/BaileysClient.ts` | Modify | +`getContacts()`, +`searchContacts()`, +cache |
| `packages/whatsapp-core/src/ports/IWhatsAppService.ts` | Modify | +`searchContacts()` in interface |
| `packages/whatsapp-core/src/services/WhatsAppService.ts` | Modify | +`setContactSearchHandler()`, +`searchContacts()` |
| `src/interface/whatsapp/features/astral/AstralController.ts` | Modify | +3 state handlers (~80 lines) |
| `src/interface/whatsapp/features/astral/AstralMenuService.ts` | Modify | +3 message builders |
| `src/domain/entities/astral/Task.ts` | Modify | +`scheduledFor?: string` in schema |
| `src/application/use-cases/astral/CreateTaskFromNLP.ts` | Modify | +`recipientId` in DTO |
| `packages/db-core/src/schema/tasks.ts` | Modify | +`scheduledFor` column (nullable) |
| `src/main.ts` | Modify | Reminder callback: `task.scheduledFor ?? task.userId` |

## Interfaces / Contracts

### IContactSearchResult (new, in BaileysClient.ts)
```typescript
export interface IContactSearchResult {
  id: string;       // contact.id._serialized
  name: string;     // contact.name || contact.pushname || "—"
  number: string;   // contact.number
  pushname?: string;
}
```

### IWhatsAppService addition
```typescript
searchContacts(query: string): Promise<IContactSearchResult[]>;
```

### WhatsAppService addition
```typescript
private searchHandler: ((query: string) => Promise<IContactSearchResult[]>) | null = null;

setContactSearchHandler(handler: (query: string) => Promise<IContactSearchResult[]>): void {
  this.searchHandler = handler;
}

async searchContacts(query: string): Promise<IContactSearchResult[]> {
  if (!this.searchHandler) return [];
  return this.searchHandler(query);
}
```

### BaileysClient additions
```typescript
private contactsCache: IContactSearchResult[] | null = null;

async getContacts(): Promise<IContactSearchResult[]> {
  if (!this.client) throw new Error("WhatsApp no conectado");
  if (this.contactsCache) return this.contactsCache;

  const raw = await this.client.getContacts();
  this.contactsCache = raw
    .filter(c => c.isMyContact || c.isWAContact)
    .map(c => ({
      id: c.id._serialized,
      name: c.name || c.pushname || "—",
      number: c.number || "",
      pushname: c.pushname,
    }));
  return this.contactsCache;
}

async searchContacts(query: string): Promise<IContactSearchResult[]> {
  const all = await this.getContacts();
  const q = query.toLowerCase();
  return all.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.number.includes(q) ||
    (c.pushname && c.pushname.toLowerCase().includes(q))
  );
}
```

### Task schema addition (Task.ts)
```typescript
scheduledFor: z.string().nullable().optional(),
```

### CreateTaskFromNLPDTO addition
```typescript
export interface CreateTaskFromNLPDTO {
  // ... existing fields
  recipientId?: string;  // optional — when set, reminder goes to this contact
}
```

### DB schema addition (packages/db-core/src/schema/tasks.ts)
```typescript
scheduledFor: text("scheduled_for"),
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | BaileysClient.searchContacts filtering | Mock getContacts, verify correct filtering by name/number/pushname |
| Unit | WhatsAppService delegation | Verify setContactSearchHandler wires correctly |
| Unit | Task schema validation | Verify scheduledFor accepts string null undefined |
| Integration | Controller state transitions | Feed messages through state machine, verify correct state transitions for self/other/search/select |
| Integration | Scheduler routing | Create task with/without scheduledFor, verify recipient in callback |

## Migration / Rollout

- **DB**: Run `drizzle-kit generate` then `drizzle-kit migrate` — additive only, `scheduled_for` defaults to NULL
- **Rollback**: Revert PR. Existing tasks with non-null `scheduled_for` lose recipient routing (revert to userId). No data loss.
- **No feature flags needed** — change is additive and backwards-compatible

## Cache Strategy

- `contactsCache: IContactSearchResult[] | null` on BaileysClient
- Lazy-loaded on first `getContacts()` call
- No invalidation needed — contacts don't change mid-session
- Search is O(n) over cached array; fine for typical address book sizes (< 1000 entries)

## Open Questions

- [ ] None — all decisions scoped and resolved
