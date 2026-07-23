import { eq, lt } from "drizzle-orm";
import type { DrizzleDB } from "@task-bot/db-core";
import { userStates } from "@task-bot/db-core";

export class TursoUserStateRepository {
    constructor(private readonly db: DrizzleDB) {}

    async save(userId: string, context: string, data: Record<string, unknown>): Promise<void> {
        await this.db
            .insert(userStates)
            .values({
                userId,
                context,
                data: JSON.stringify(data),
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: userStates.userId,
                set: {
                    context,
                    data: JSON.stringify(data),
                    updatedAt: new Date(),
                },
            });
    }

    async loadAll(): Promise<Map<string, { context: string; data: Record<string, unknown> }>> {
        const rows = await this.db.select().from(userStates);
        const map = new Map<string, { context: string; data: Record<string, unknown> }>();
        for (const row of rows) {
            try {
                map.set(row.userId, {
                    context: row.context,
                    data: JSON.parse(row.data),
                });
            } catch {
                // Skip corrupted entries
            }
        }
        return map;
    }

    async deleteStale(beforeDate: Date): Promise<void> {
        await this.db
            .delete(userStates)
            .where(lt(userStates.updatedAt, beforeDate));
    }
}
