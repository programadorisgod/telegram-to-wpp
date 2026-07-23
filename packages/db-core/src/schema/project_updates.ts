import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const projectUpdates = sqliteTable(
    "project_updates",
    {
        id: text("id").primaryKey(),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id),
        userId: text("user_id")
            .notNull()
            .references(() => users.userId),
        content: text("content").notNull(),
        createdAt: text("created_at").notNull(),
    },
    (table) => [
        index("idx_project_updates_project_created").on(
            table.projectId,
            table.createdAt,
        ),
    ],
);

export type ProjectUpdate = InferSelectModel<typeof projectUpdates>;
export type NewProjectUpdate = InferInsertModel<typeof projectUpdates>;
