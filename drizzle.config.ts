import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./packages/db-core/src/schema/index.ts",
    out: "./packages/db-core/drizzle",
    dialect: "turso",
    dbCredentials: {
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_TOKEN,
    },
});
