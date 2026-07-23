import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const users = sqliteTable("users", {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    country: text("country").notNull(),
    createdAt: text("created_at").notNull(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
