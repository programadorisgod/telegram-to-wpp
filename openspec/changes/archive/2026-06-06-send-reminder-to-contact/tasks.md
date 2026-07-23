# Tasks: send-reminder-to-contact

## Phase 1: WhatsApp Infrastructure

- [ ] 1.1 `BaileysClient.ts` — add `IContactSearchResult` interface, `contactsCache` field, `getContacts()` with lazy caching filtering by `isMyContact || isWAContact`, and `searchContacts(query)` with case-insensitive local filter on name/pushname/number
- [ ] 1.2 `IWhatsAppService.ts` — export `IContactSearchResult`, add `searchContacts(query: string): Promise<IContactSearchResult[]>` to the interface
- [ ] 1.3 `WhatsAppService.ts` — add private `searchHandler`, `setContactSearchHandler()`, and delegating `searchContacts()` method
- [ ] 1.4 `main.ts` — wire `whatsappService.setContactSearchHandler(q => baileysClient.searchContacts(q))`

## Phase 2: Conversation Flow

- [ ] 2.1 `AstralMenuService.ts` — add 5 new message methods: `promptRecipientChoice()`, `promptContactName()`, `formatContactResults()`, `noContactResults()`, `recipientSelected(name)`
- [ ] 2.2 `AstralController.ts` — add 3 enum entries (`waiting_recipient_choice`, `waiting_contact_search`, `waiting_contact_select`), implement handlers for each, modify `createTaskWithReminder()` to accept optional `recipientId`

## Phase 3: Persistence

- [ ] 3.1 `Task.ts` schema (Zod) — add `scheduledFor: z.string().nullable().optional()`, init in constructor as `this.scheduledFor = data.scheduledFor ?? null`, include in `toJSON()`
- [ ] 3.2 `packages/db-core/src/schema/tasks.ts` — add `scheduledFor: text("scheduled_for")` nullable column; verify `NewTask` type in `IAstralTaskRepository.ts` includes it via Drizzle inference
- [ ] 3.3 `CreateTaskFromNLP.ts` — add `recipientId?: string` to DTO interface, pass it as `scheduledFor: dto.recipientId ?? null` to Task constructor

## Phase 4: Scheduler Routing

- [ ] 4.1 `main.ts` reminder callback — replace `task.userId` with `task.scheduledFor ?? task.userId` in all 3 callback locations (reminder delivery)

## Phase 5: Database Migration

- [ ] 5.1 Run `drizzle-kit generate && drizzle-kit migrate`; verify `scheduled_for` column is NULLable and existing queries remain unaffected
