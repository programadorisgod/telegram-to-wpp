import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users.js";

export const notes = sqliteTable(
    "notes",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.userId),
        title: text("title"),
        content: text("content").notNull(),
        imageUrl: text("image_url"),
        imageMimeType: text("image_mime_type"),
        imageSize: integer("image_size"),
        createdAt: text("created_at").notNull(),
        updatedAt: text("updated_at").notNull(),
    },
    (table) => [
        index("idx_notes_user_created").on(
            table.userId,
            table.createdAt,
        ),
    ],
);

export type Note = InferSelectModel<typeof notes>;
export type NewNote = InferInsertModel<typeof notes>;
