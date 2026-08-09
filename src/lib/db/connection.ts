// ---------------------------------------------------------------------------
// Connection-string resolution. Explicit DATABASE_URL/DIRECT_URL always win;
// otherwise, when SUPABASE_DB_PASSWORD is set, the URLs are assembled from
// the project's known coordinates (ref from SUPABASE_URL; region/pooler host
// verified by probing: this project lives on aws-0-ca-central-1). With
// neither, callers fall back to local PGlite.
// ---------------------------------------------------------------------------

const POOLER_HOST = "aws-0-ca-central-1.pooler.supabase.com";

function projectRef(): string | null {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
  return match?.[1] ?? null;
}

function assembled(port: 6543 | 5432): string | null {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = projectRef();
  if (!password || !ref) return null;
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${POOLER_HOST}:${port}/postgres`;
}

/** Transaction-mode pooler URL for the app (prepared statements disabled). */
export function pooledDatabaseUrl(): string | null {
  return process.env.DATABASE_URL || assembled(6543);
}

/** Session-mode URL for migrations. */
export function directDatabaseUrl(): string | null {
  return process.env.DIRECT_URL || assembled(5432) || pooledDatabaseUrl();
}
