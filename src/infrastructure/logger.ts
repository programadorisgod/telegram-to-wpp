import pino from "pino";
import pretty from "pino-pretty";
import { env } from "./config/env.js";

/**
 * Create a structured JSON logger using pino.
 *
 * Log levels: fatal > error > warn > info > debug > trace
 * Production defaults to "info", development to "debug".
 */
function createLogger(options?: { name?: string; level?: string }) {
  const level = options?.level ?? (env.NODE_ENV === "production" ? "info" : "debug");

  const stream =
    env.NODE_ENV === "development"
      ? pretty({
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        })
      : undefined;

  return pino(
    {
      level,
      name: options?.name,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream,
  );
}

/** Root logger for the application */
export const logger = createLogger({ name: "astral-bot" });

/**
 * Create a child logger with additional context.
 *
 * Example:
 *   const msgLogger = logger.child({ sender: "5491112345678" });
 *   msgLogger.info("Message received");
 */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export type AppLogger = ReturnType<typeof createLogger>;
