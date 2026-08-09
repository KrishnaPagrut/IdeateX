import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";

import { db, personas, type Persona } from "@/lib/db";
import { generate } from "@/lib/llm/client";
import { GeneratedPersonaBatchSchema } from "@/lib/schemas/persona-gen";
import { buildPersonaBatchPrompt, PERSONA_GEN_SYSTEM } from "@/lib/prompts/persona-gen";

const BodySchema = z.object({
  count: z.number().int().min(1).max(40).default(20),
});

/** Rotating archetype families for ad-hoc generation batches. */
const ARCHETYPE_FAMILIES = [
  "early-adopter techie",
  "budget-conscious parent",
  "skeptical retiree",
  "small-business owner",
  "status-seeking professional",
  "frugal student",
  "rural pragmatist",
  "urban creative",
  "corporate middle manager",
  "health-anxious senior",
  "gig worker",
  "civic-minded teacher",
];

function quotaFor(count: number, offset: number): string {
  const families = Array.from(
    { length: 4 },
    (_, i) => ARCHETYPE_FAMILIES[(offset + i) % ARCHETYPE_FAMILIES.length],
  );
  const base = Math.floor(count / families.length);
  const remainder = count % families.length;
  return families
    .map((family, i) => `- ${base + (i < remainder ? 1 : 0)} × ${family}`)
    .filter((line) => !line.startsWith("- 0 "))
    .join("\n");
}

/**
 * POST /api/personas/generate — body {count?: number} (default 20, max 40).
 * Runs generation inline (one LLM call per batch of ≤20) and inserts with
 * source 'generated'. Returns the new personas.
 * Note: server-side cost per call; acceptable for MVP.
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
  const { count } = parsed.data;

  // Exclusion lists from the current library keep new personas distinct.
  const existing = await db
    .select({ name: personas.name, demographics: personas.demographics })
    .from(personas);
  const usedNames = new Set(existing.map((p) => p.name));
  const usedOccupations = new Set(existing.map((p) => p.demographics.occupation));

  const created: Persona[] = [];
  // The model may return fewer than requested (the mock adapter returns ~2 per
  // call), so iterate — with a hard cap so a degenerate model can't loop forever.
  const maxIterations = 30;
  let offset = Math.floor(Math.random() * ARCHETYPE_FAMILIES.length);

  for (let i = 0; i < maxIterations && created.length < count; i++) {
    const remaining = Math.min(20, count - created.length);
    const result = await generate({
      role: "generator",
      schema: GeneratedPersonaBatchSchema,
      system: PERSONA_GEN_SYSTEM,
      prompt: buildPersonaBatchPrompt({
        count: remaining,
        archetypeQuota: quotaFor(remaining, offset),
        usedNames: [...usedNames].slice(-400),
        usedOccupations: [...usedOccupations].slice(-400),
      }),
    });

    const batch = result.object.personas.slice(0, remaining);
    if (batch.length === 0) break;

    const rows = await db
      .insert(personas)
      .values(
        batch.map((p) => ({
          ...p,
          avatarSeed: nanoid(),
          source: "generated" as const,
        })),
      )
      .returning();

    created.push(...rows);
    for (const p of batch) {
      usedNames.add(p.name);
      usedOccupations.add(p.demographics.occupation);
    }
    offset += 4;
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "Generation produced no personas" }, { status: 502 });
  }

  return NextResponse.json({ personas: created }, { status: 201 });
}
