import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, personas, customPools } from "@/lib/db";
import { generate } from "@/lib/llm/client";
import { allSubdomains } from "@/lib/personas/taxonomy";
import {
  CUSTOM_DOMAIN,
  dedupeSlug,
  listCustomPools,
  slugifyPoolName,
} from "@/lib/personas/custom-pools";
import { PoolSpecSchema } from "@/lib/schemas/persona-gen";
import { buildPoolSpecPrompt, POOL_SPEC_SYSTEM } from "@/lib/prompts/persona-gen";

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
 * be 0), every custom pool (user-created from a prompt), plus any other
 * non-taxonomy pools that exist in the DB (e.g. general/general for
 * pre-taxonomy personas), with live active-persona counts.
 */
export async function GET() {
  const [counts, custom] = await Promise.all([
    db
      .select({
        domain: personas.domain,
        subdomain: personas.subdomain,
        count: sql<number>`count(*)::int`,
      })
      .from(personas)
      .where(eq(personas.active, true))
      .groupBy(personas.domain, personas.subdomain),
    listCustomPools(),
  ]);

  const countByKey = new Map(counts.map((c) => [`${c.domain}/${c.subdomain}`, c.count]));

  const pools: PoolInfo[] = allSubdomains().map((s) => ({
    domain: s.domainKey,
    subdomain: s.key,
    name: s.name,
    description: s.description,
    count: countByKey.get(`${s.domainKey}/${s.key}`) ?? 0,
    sample: [],
  }));

  for (const c of custom) {
    pools.push({
      domain: c.domain,
      subdomain: c.subdomain,
      name: c.name,
      description: c.description,
      count: countByKey.get(`${c.domain}/${c.subdomain}`) ?? 0,
      sample: [],
    });
  }

  // Pools present in the DB but absent from the taxonomy and the custom-pool
  // table still surface.
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

const CreateBodySchema = z.object({
  /** Free-text description of the population, e.g. "risk-averse high earners". */
  prompt: z.string().trim().min(8, "Describe the population in at least a few words"),
});

/**
 * POST /api/personas/pools — body {prompt}. One LLM call distills the prompt
 * into a pool definition (name, description, seed hints) stored under the
 * "custom" domain. Members are generated separately via
 * POST /api/personas/generate with the returned pool key.
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const parsed = CreateBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await listCustomPools();
  const existingNames = [
    ...allSubdomains().map((s) => s.name),
    ...existing.map((c) => c.name),
  ];

  let spec;
  try {
    const result = await generate({
      role: "generator",
      schema: PoolSpecSchema,
      system: POOL_SPEC_SYSTEM,
      prompt: buildPoolSpecPrompt(parsed.data.prompt, existingNames),
    });
    spec = result.object;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pool definition failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Custom pools all live under the "custom" domain, so uniqueness within
  // existing custom slugs is enough — taxonomy keys can't collide.
  const taken = new Set(existing.map((c) => c.subdomain));
  const slug = dedupeSlug(slugifyPoolName(spec.name) || "custom-pool", taken);

  const [row] = await db
    .insert(customPools)
    .values({
      domain: CUSTOM_DOMAIN,
      subdomain: slug,
      name: spec.name,
      description: spec.description,
      seedHints: spec.seedHints,
      prompt: parsed.data.prompt,
    })
    .returning();

  const pool: PoolInfo = {
    domain: row.domain,
    subdomain: row.subdomain,
    name: row.name,
    description: row.description,
    count: 0,
    sample: [],
  };
  return NextResponse.json({ pool }, { status: 201 });
}
