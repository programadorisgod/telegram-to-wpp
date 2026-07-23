#!/usr/bin/env tsx
import { createClient } from "@libsql/client";
import { existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) config({ path: envPath });

async function main() {
    const client = createClient({
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_TOKEN,
    });

    // Check tasks table schema
    const info = await client.execute("PRAGMA table_info(tasks)");
    console.log("📋 tasks columns:");
    for (const row of info.rows) {
        console.log(`  ${row.cid}: ${row.name} (${row.type}) nullable=${row.notnull === 0}`);
    }

    console.log("\n📋 All tables:");
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    for (const row of tables.rows) {
        console.log(`  - ${row.name}`);
    }

    client.close();
}

main().catch(console.error);
