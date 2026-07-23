import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users.js";

export const tasks = sqliteTable("tasks", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.userId),
    description: text("description").notNull(),
    datetime: text("datetime").notNull(),
    reminderConfig: text("reminder_config").notNull(),
    /** Optional media URL (Supabase public URL) for image/audio reminders */
    mediaUrl: text("media_url"),
    /** MIME type of the media file (e.g. "image/jpeg", "audio/ogg") */
    mediaType: text("media_type"),
    /** WhatsApp ID del destinatario alternativo (NULL = el creador) */
    scheduledFor: text("scheduled_for"),
    /** JSON-serialized RecurrenceFrequency (NULL = one-time task) */
    frequency: text("frequency"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
});

export type Task = InferSelectModel<typeof tasks>;
export type NewTask = InferInsertModel<typeof tasks>;
