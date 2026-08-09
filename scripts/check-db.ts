/**
 * Connection + schema sanity check for the configured database.
 *   pnpm check-db
 * Reports which backend is active (Supabase vs PGlite fallback), whether the
 * newest schema columns exist, and row counts.
 */
import postgres from "postgres";

import { pooledDatabaseUrl } from "../src/lib/db/connection";

const REQUIRED_COLUMNS = [
  ["personas", "domain"],
  ["personas", "subdomain"],
  ["runs", "persona_budget"],
  ["runs", "discussion"],
] as const;

async function main() {
  const url = pooledDatabaseUrl();
  if (!url) {
    console.log("backend: PGlite fallback (no Supabase credentials configured)");
    return;
  }

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const [v] = await sql`select version()`;
    console.log("backend: Supabase —", (v.version as string).split(" on ")[0]);

    const cols = await sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('personas', 'runs', 'agent_runs', 'run_events')`;
    const present = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
    const missing = REQUIRED_COLUMNS.filter(([t, c]) => !present.has(`${t}.${c}`));
    if (missing.length > 0) {
      console.log("MISSING columns:", missing.map(([t, c]) => `${t}.${c}`).join(", "));
      process.exitCode = 2;
    } else {
      console.log("schema: up to date (all delta columns present)");
    }

    for (const table of ["personas", "runs", "agent_runs", "run_events"]) {
      const [row] = await sql`select count(*)::int as n from ${sql(table)}`;
      console.log(`  ${table}: ${row.n} rows`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("connection FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
