#!/usr/bin/env tsx
/**
 * Drop stale tables and re-run the migration from scratch.
 * Safe for dev — drops tables that don't match the current schema.
 */
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) config({ path: envPath });

async function main() {
    const client = createClient({
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_TOKEN,
    });

    // Drop OLD/wrong tables (keep users, audio_reminders, image_reminders, projects — they're fine)
    console.log("🗑️  Dropping stale tables...");
    for (const table of ["tasks", "reminders", "schedules"]) {
        await client.execute(`DROP TABLE IF EXISTS "${table}"`);
        console.log(`  ✗ ${table} dropped`);
    }

    // Re-apply migration
    const migPath = join(process.cwd(), "packages", "db-core", "drizzle", "0000_slimy_lilith.sql");
    const sql = readFileSync(migPath, "utf-8");
    const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

    console.log("\n📄 Re-applying migration...");
    for (const stmt of statements) {
        try {
            await client.execute(stmt);
            console.log(`  ✓`);
        } catch (err: any) {
            if (err?.message?.includes("already exists")) {
                console.log(`  ⏭️  (exists)`);
            } else {
                throw err;
            }
        }
    }

    // Verify
    console.log("\n📋 Final tables:");
    const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    for (const row of tables.rows) {
        // Check schema
        const info = await client.execute(`PRAGMA table_info("${row.name}")`);
        const cols = info.rows.map((r: any) => `${r.name}`).join(", ");
        console.log(`  - ${row.name}: [${cols}]`);
    }

    client.close();
    console.log("\n✅ Done");
}

main().catch(console.error);
