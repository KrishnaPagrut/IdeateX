import { defineConfig } from "drizzle-kit";

// Session-mode direct URL for migrations — assembled from SUPABASE_DB_PASSWORD
// when explicit URLs are absent (see src/lib/db/connection.ts).
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.SUPABASE_URL ?? "")?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;
const assembled =
  ref && password
    ? `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`
    : undefined;

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL || assembled || process.env.DATABASE_URL || "",
  },
});
