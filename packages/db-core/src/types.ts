import type { LibSQLDatabase } from "drizzle-orm/libsql";

export type DatabaseDriver = "turso" | "neon";

export interface DatabaseConfig {
  driver: DatabaseDriver;
  url: string;
  authToken?: string;
  /** Maximum concurrent connections (default: 10 for Turso) */
  concurrency?: number;
}

/**
 * Drizzle database instance for the currently configured driver.
 *
 * For Turso/libsql → LibSQLDatabase
 * For Neon/pg      → NeonDatabase (schema must use pgTable)
 *
 * When switching drivers, change this alias and the schema accordingly.
 */
export type DrizzleDB<TSchema extends Record<string, unknown> = any> =
  LibSQLDatabase<TSchema>;
