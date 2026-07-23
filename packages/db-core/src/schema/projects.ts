import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./users.js";

export const projects = sqliteTable("projects", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.userId),
    name: text("name").notNull(),
    completedTasks: text("completed_tasks").notNull(),
    pendingTasks: text("pending_tasks").notNull(),
    priorityOrder: integer("priority_order").notNull(),
    frequency: text("frequency"),
    createdAt: text("created_at").notNull(),
});

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;
