import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { db, personas } from "@/lib/db";
import { allSubdomains } from "@/lib/personas/taxonomy";

export interface PoolInfo {
  domain: string;
  subdomain: string;
  name: string;
  description: string;
  count: number;
  /** Avatar seeds + names of a few members, newest first, for avatar stacks. */
  sample: Array<{ id: string; name: string; avatarSeed: string }>;
}

/**
 * GET /api/personas/pools — the pool catalog: every taxonomy pool (count may
 * be 0) plus any non-taxonomy pools that exist in the DB (e.g. general/general
 * for pre-taxonomy personas), with live active-persona counts.
 */
export async function GET() {
  const counts = await db
    .select({
      domain: personas.domain,
      subdomain: personas.subdomain,
      count: sql<number>`count(*)::int`,
    })
    .from(personas)
    .where(eq(personas.active, true))
    .groupBy(personas.domain, personas.subdomain);

  const countByKey = new Map(counts.map((c) => [`${c.domain}/${c.subdomain}`, c.count]));

  const pools: PoolInfo[] = allSubdomains().map((s) => ({
    domain: s.domainKey,
    subdomain: s.key,
    name: s.name,
    description: s.description,
    count: countByKey.get(`${s.domainKey}/${s.key}`) ?? 0,
    sample: [],
  }));

  // Pools present in the DB but absent from the taxonomy still surface.
  const known = new Set(pools.map((p) => `${p.domain}/${p.subdomain}`));
  for (const c of counts) {
    const key = `${c.domain}/${c.subdomain}`;
    if (known.has(key)) continue;
    pools.push({
      domain: c.domain,
      subdomain: c.subdomain,
      name: key === "general/general" ? "General population" : key,
      description:
        key === "general/general"
          ? "Personas created before the pool taxonomy, or without a pool."
          : `Personas in the ${key} pool (not in the taxonomy).`,
      count: c.count,
      sample: [],
    });
  }

  // One small query per non-empty pool for the avatar stacks. At ≤30ish pools
  // this stays cheap, and PGlite/postgres both handle it fine.
  await Promise.all(
    pools
      .filter((p) => p.count > 0)
      .map(async (p) => {
        p.sample = await db
          .select({ id: personas.id, name: personas.name, avatarSeed: personas.avatarSeed })
          .from(personas)
          .where(
            and(
              eq(personas.active, true),
              eq(personas.domain, p.domain),
              eq(personas.subdomain, p.subdomain),
            ),
          )
          .orderBy(desc(personas.createdAt))
          .limit(5);
      }),
  );

  return NextResponse.json({ pools });
}
