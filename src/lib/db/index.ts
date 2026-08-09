import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";

import * as schema from "./schema";

// With DATABASE_URL set (Supabase), use the postgres-js driver against the
// transaction pooler. Without it, fall back to PGlite — a real in-process
// Postgres persisted to ./.pglite — so local dev needs zero DB setup.
// Cached on globalThis to survive Next.js dev-mode module re-evaluation.

type Database = ReturnType<typeof drizzlePostgres<typeof schema>>;

const globalDb = globalThis as unknown as { __ideatexDb?: Database };

async function createDb(): Promise<Database> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // Supabase transaction-mode pooler does not support prepared statements.
    const client = postgres(connectionString, { prepare: false });
    return drizzlePostgres(client, { schema });
  }

  const pglite = new PGlite(path.join(process.cwd(), ".pglite"));
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Database;
}

export const db = (globalDb.__ideatexDb ??= await createDb());

export * from "./schema";
