import type { DatabaseConfig, DrizzleDB } from "./types.js";

/**
 * Create a typed drizzle database instance from config + schema.
 *
 * Each driver is lazy-loaded — only the driver you use gets imported.
 * Add a new `case` here when supporting additional drizzle-compatible
 * databases (postgres, mysql, etc.).
 */
export function createDatabase<TSchema extends Record<string, unknown>>(
    config: DatabaseConfig,
    schema: TSchema,
): DrizzleDB<TSchema> {
    switch (config.driver) {
        case "turso":
            return createTursoDB(config, schema);
        case "neon":
            return createNeonDB(config, schema);
        default: {
            const _exhaustive: never = config.driver;
            throw new Error(
                `Unsupported database driver: "${_exhaustive}". ` +
                    `Available: turso, neon`,
            );
        }
    }
}

// ── Driver implementations (lazy-required) ────────────────────

function createTursoDB<TSchema extends Record<string, unknown>>(
    config: DatabaseConfig,
    schema: TSchema,
): DrizzleDB<TSchema> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("@libsql/client");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { drizzle } = require("drizzle-orm/libsql");

    const client = createClient({
        url: config.url,
        authToken: config.authToken,
        concurrency: config.concurrency ?? 10,
    });
    return drizzle(client, { schema }) as unknown as DrizzleDB<TSchema>;
}

function createNeonDB<TSchema extends Record<string, unknown>>(
    config: DatabaseConfig,
    schema: TSchema,
): DrizzleDB<TSchema> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { neon } = require("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { drizzle } = require("drizzle-orm/neon-http");

    const client = neon(config.url);
    return drizzle(client, { schema }) as unknown as DrizzleDB<TSchema>;
}
