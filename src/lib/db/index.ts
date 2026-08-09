import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";

import { pooledDatabaseUrl } from "./connection";
import * as schema from "./schema";

// With DATABASE_URL set (Supabase), use the postgres-js driver against the
// transaction pooler. Without it, fall back to PGlite — a real in-process
// Postgres persisted to ./.pglite — so local dev needs zero DB setup.
// Cached on globalThis to survive Next.js dev-mode module re-evaluation.

type Database = ReturnType<typeof drizzlePostgres<typeof schema>>;

// The PROMISE is cached (not the resolved value) so concurrent module
// evaluations — e.g. two route bundles compiling at once in dev — share one
// createDb() call instead of racing to open the same PGlite directory.
const globalDb = globalThis as unknown as { __ideatexDb?: Promise<Database> };

async function createDb(): Promise<Database> {
  const connectionString = pooledDatabaseUrl();
  if (connectionString) {
    // Supabase transaction-mode pooler does not support prepared statements.
    const client = postgres(connectionString, { prepare: false });
    return drizzlePostgres(client, { schema });
  }

  // PGLITE_DIR lets scripts/tests use their own database directory — PGlite is
  // single-process, so sharing ./.pglite with a running dev server corrupts it.
  const pglite = new PGlite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".pglite"));
  const db = drizzlePglite(pglite, { schema });
  await migratePglite(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Database;
}

function getDb(): Promise<Database> {
  const cached = globalDb.__ideatexDb;
  if (cached) return cached;
  // Clear the cache on failure so the next import retries instead of caching
  // a rejected promise forever (e.g. a transient PGlite dir collision while a
  // Next.js dev/build worker process briefly held the directory).
  const promise = createDb().catch((error: unknown) => {
    globalDb.__ideatexDb = undefined;
    throw error;
  });
  globalDb.__ideatexDb = promise;
  return promise;
}

// Next.js imports route modules in short-lived helper processes that must
// never open PGlite alongside the real server (same ./.pglite directory):
//  - `next build` page-data collection (NEXT_PHASE=phase-production-build)
//  - `next dev` static-paths workers (jest-worker sets JEST_WORKER_ID)
// Those helpers only inspect module exports and never run a query, so they
// get an inert placeholder; the real server (and scripts/tests) get the db.
const isNextHelperProcess =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.JEST_WORKER_ID !== undefined;

export const db = isNextHelperProcess
  ? (undefined as unknown as Database)
  : await getDb();

export * from "./schema";
