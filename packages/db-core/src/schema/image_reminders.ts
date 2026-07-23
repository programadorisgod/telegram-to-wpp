import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users.js";

export const imageReminders = sqliteTable("image_reminders", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.userId),
    imageUrl: text("image_url").notNull(),
    extractedText: text("extracted_text").notNull(),
    datetime: text("datetime").notNull(),
    createdAt: text("created_at").notNull(),
});

export type ImageReminder = InferSelectModel<typeof imageReminders>;
export type NewImageReminder = InferInsertModel<typeof imageReminders>;
