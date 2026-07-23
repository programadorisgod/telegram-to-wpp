#!/usr/bin/env tsx
/**
 * Migration runner for Turso.
 * Applies each SQL statement individually, skipping if table already exists.
 *
 * Usage: pnpm tsx scripts/migrate.ts
 */
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
    config({ path: envPath });
}

async function main() {
    const url = process.env.TURSO_URL;
    const authToken = process.env.TURSO_TOKEN;

    if (!url) {
        console.error("❌ TURSO_URL is required in .env");
        process.exit(1);
    }

    console.log(`🔌 Connecting to Turso...`);
    const client = createClient({ url, authToken });

    const migrationsDir = join(process.cwd(), "packages", "db-core", "drizzle");
    const migrationFiles = ["0000_slimy_lilith.sql"];

    for (const file of migrationFiles) {
        const path = join(migrationsDir, file);
        if (!existsSync(path)) {
            console.warn(`⚠️  Not found: ${file}`);
            continue;
        }

        console.log(`📄 ${file}`);
        const sql = readFileSync(path, "utf-8");
        const statements = sql
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter(Boolean);

        for (const stmt of statements) {
            try {
                await client.execute(stmt);
                console.log(`  ✓`);
            } catch (err: any) {
                if (err?.message?.includes("already exists")) {
                    console.log(`  ⏭️  (already exists, skipped)`);
                } else {
                    console.error(`  ❌ ${err.message}`);
                }
            }
        }
    }

    // Verify
    const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    console.log("\n📋 Tables:");
    for (const row of result.rows) {
        console.log(`  - ${row.name}`);
    }

    client.close();
}

main().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
