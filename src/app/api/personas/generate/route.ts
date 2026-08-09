import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db, personas, type Persona } from "@/lib/db";
import { generate } from "@/lib/llm/client";
import { buildCastingSheet } from "@/lib/personas/casting-sheet";
import { resolvePoolTarget } from "@/lib/personas/custom-pools";
import { GeneratedPersonaBatchSchema } from "@/lib/schemas/persona-gen";
import {
  buildPersonaBatchPrompt,
  PERSONA_GEN_SYSTEM,
  type PoolTarget,
} from "@/lib/prompts/persona-gen";

/** High-but-coherent sampling temperature for persona generation diversity. */
const GEN_TEMPERATURE = 0.9;

const BodySchema = z.object({
  count: z.number().int().min(1).max(40).default(20),
  /** Optional pool key ("consumers/budget-households") — generated personas
   * are stamped into this pool and written to fit it. */
  pool: z.string().optional(),
});

/** Fallback target for pool-less generation: the general population. */
const GENERAL_POOL: PoolTarget = {
  domainKey: "general",
  subdomainKey: "general",
  name: "General population",
  description:
    "A cross-section of the whole population — no single domain; span consumers, workers, business people, and skeptics of all stripes.",
  seedHints:
    "parents, retirees, students, tradespeople, office workers, small-business owners, gig workers, technophiles and technophobes",
};

/**
 * POST /api/personas/generate — body {count?: number, pool?: "domain/subdomain"}.
 * Runs generation inline (one LLM call per batch of ≤20) and inserts with
 * source 'generated', stamped into the requested pool (or general/general).
 * Returns the new personas. Note: server-side cost per call; acceptable for MVP.
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { count, pool } = parsed.data;

  let target = GENERAL_POOL;
  if (pool) {
    // Taxonomy pools first, then user-created custom pools.
    const resolved = await resolvePoolTarget(pool);
    if (!resolved) {
      return NextResponse.json({ error: `Unknown pool "${pool}"` }, { status: 400 });
    }
    target = resolved;
  }

  // Exclusion lists from the current library keep new personas distinct;
  // the pool's existing tags keep casting labels coherent.
  const existing = await db
    .select({ name: personas.name, demographics: personas.demographics })
    .from(personas);
  const usedNames = new Set(existing.map((p) => p.name));
  const usedOccupations = new Set(existing.map((p) => p.demographics.occupation));

  const poolRows = await db
    .select({ tags: personas.tags })
    .from(personas)
    .where(
      and(eq(personas.domain, target.domainKey), eq(personas.subdomain, target.subdomainKey)),
    );
  const poolTags = new Set(poolRows.flatMap((r) => r.tags));

  const created: Persona[] = [];
  // The model may return fewer than requested (the mock adapter returns ~2 per
  // call), so iterate — with a hard cap so a degenerate model can't loop forever.
  const maxIterations = 30;

  for (let i = 0; i < maxIterations && created.length < count; i++) {
    const remaining = Math.min(20, count - created.length);
    const result = await generate({
      role: "generator",
      schema: GeneratedPersonaBatchSchema,
      system: PERSONA_GEN_SYSTEM,
      temperature: GEN_TEMPERATURE,
      prompt: buildPersonaBatchPrompt({
        count: remaining,
        pool: target,
        // Fresh randomized casting sheet per batch — controlled stochasticity.
        sheet: buildCastingSheet(),
        usedNames: [...usedNames].slice(-400),
        usedOccupations: [...usedOccupations].slice(-400),
        poolTags: [...poolTags].slice(-60),
      }),
    });

    const batch = result.object.personas.slice(0, remaining);
    if (batch.length === 0) break;

    const rows = await db
      .insert(personas)
      .values(
        batch.map((p) => ({
          ...p,
          domain: target.domainKey,
          subdomain: target.subdomainKey,
          avatarSeed: nanoid(),
          source: "generated" as const,
        })),
      )
      .returning();

    created.push(...rows);
    for (const p of batch) {
      usedNames.add(p.name);
      usedOccupations.add(p.demographics.occupation);
      for (const t of p.tags) poolTags.add(t);
    }
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "Generation produced no personas" }, { status: 502 });
  }

  return NextResponse.json({ personas: created }, { status: 201 });
}
