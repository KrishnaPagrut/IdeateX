import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Session-mode direct URL — migrations must not go through the transaction pooler.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
