import { z } from "zod";
import { config } from "dotenv";
import { join, resolve } from "path";
import { existsSync } from "fs";

// Try cwd first (dev/npm scripts), fallback to script-relative (PM2)
const envPath = existsSync(join(process.cwd(), ".env"))
    ? join(process.cwd(), ".env")
    : resolve(__dirname, "..", "..", "..", ".env");
config({ path: envPath });

const environmentSchema = z.object({
    WHATSAPP_SESSION_PATH: z.string().default("./sessions"),
    CHROME_PATH: z.string().default("/usr/bin/chromium"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace"])
        .default("info"),
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    PORT: z
        .string()
        .min(1)
        .transform((val) => parseInt(val, 10))
        .default("5199"),
    BOT_WELCOME_MESSAGE: z.string().default("Bienvenido al bot"),

    // ── Telegram Bridge ────────────────────────────────────────
    BRIDGE_BOT_TOKEN: z.string().default(""),
    TELEGRAM_GROUP_ID: z.coerce.number().default(0),
    BRIDGE_AUTHORIZED_WPP_IDS: z.string().default(""),

    // ── Database (user_states for bridge state) ───────────────
    TURSO_URL: z.string().min(1, "TURSO_URL is required"),
    TURSO_TOKEN: z.string().optional(),

    // ── TTL Caches (ms) ────────────────────────────────────────
    TTL_CACHE_USER_STATES: z.coerce.number().int().min(60000).default(1800000), // 30min
    TTL_CACHE_SESSIONS: z.coerce.number().int().min(60000).default(900000), // 15min
    TTL_CACHE_MESSAGES: z.coerce.number().int().min(60000).default(300000), // 5min

    // ── Concurrency ────────────────────────────────────────────
    WHATSAPP_CONCURRENCY: z.coerce.number().int().min(1).default(3),
});

const { data, error, success } = environmentSchema.safeParse(process.env);

if (!success) {
    throw new Error(`Invalid environment variables: ${error.message}`);
}

export const env = data;