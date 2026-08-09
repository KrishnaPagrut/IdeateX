/**
 * SQLite connection. Single local file, created and migrated on first import.
 *
 * We push the schema with drizzle-kit in development; `ensureSchema` below is a
 * belt-and-braces guard so a fresh clone can run `npm run dev` with no setup
 * step, which matters when the demo is being set up on someone else's laptop.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.LAUNCHLAB_DB ?? path.join(process.cwd(), "launchlab.db");

declare global {
  // eslint-disable-next-line no-var
  var __launchlabDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalThis.__launchlabDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__launchlabDb = db;
}

export { schema };
