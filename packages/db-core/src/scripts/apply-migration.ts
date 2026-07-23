import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_TOKEN;
  if (!url) { console.error("TURSO_URL not set"); process.exit(1); }

  const client = createClient({ url, authToken: token });

  try {
    await client.execute("ALTER TABLE tasks ADD COLUMN scheduled_for text");
    console.log("✅ Column scheduled_for added successfully");
  } catch (e: any) {
    if (e.message?.includes("duplicate column")) {
      console.log("✅ Column scheduled_for already exists");
    } else {
      console.error("Error:", e.message);
    }
  }

  client.close();
}

main().catch(console.error);
