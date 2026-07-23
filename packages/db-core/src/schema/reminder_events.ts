import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Persistent reminder events table.
 *
 * Each row represents one reminder offset for a task.
 * A task with {oneHourBefore: true, exactTime: true} generates 2 rows.
 * Recurring tasks insert new rows for each future occurrence.
 */
export const reminderEvents = sqliteTable(
    "reminder_events",
    {
        id: text("id").primaryKey(),
        taskId: text("task_id").notNull(),
        type: text("type", {
            enum: ["one_day_before", "three_hours_before", "one_hour_before", "thirty_minutes_before", "fifteen_minutes_before", "exact_time"],
        }).notNull(),
        fireAt: text("fire_at").notNull(),
        status: text("status", {
            enum: ["pending", "fired", "cancelled"],
        }).notNull().default("pending"),
        createdAt: text("created_at").notNull(),
        firedAt: text("fired_at"),
    },
    (table) => [
        index("idx_revents_due").on(table.fireAt, table.status),
        index("idx_revents_task").on(table.taskId),
    ],
);

export type ReminderEvent = InferSelectModel<typeof reminderEvents>;
export type NewReminderEvent = InferInsertModel<typeof reminderEvents>;
