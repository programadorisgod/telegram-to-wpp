import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users.js";

export const audioReminders = sqliteTable("audio_reminders", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.userId),
    audioUrl: text("audio_url").notNull(),
    transcription: text("transcription").notNull(),
    datetime: text("datetime").notNull(),
    createdAt: text("created_at").notNull(),
});

export type AudioReminder = InferSelectModel<typeof audioReminders>;
export type NewAudioReminder = InferInsertModel<typeof audioReminders>;
