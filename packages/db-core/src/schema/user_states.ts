import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  context: text("context").notNull(),
  data: text("data").notNull(), // JSON string
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type UserState = InferSelectModel<typeof userStates>;
export type NewUserState = InferInsertModel<typeof userStates>;
