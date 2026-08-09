import { desc } from "drizzle-orm";
import { z } from "zod";

import { RUN_TIERS } from "@/lib/db/schema";
import { estimateRunCost } from "@/lib/llm/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The db (PGlite in local dev) and the engine are imported lazily inside the
// handlers: Next.js evaluates route modules in helper processes (build
// page-data collection, dev static-paths workers) where opening a second
// PGlite on ./.pglite corrupts the real server's instance.

const CreateRunSchema = z.object({
  productName: z.string().trim().min(2, "Name the product").max(120),
  description: z
    .string()
    .trim()
    .min(20, "Describe the product in at least 20 characters"),
  targetAudience: z
    .string()
    .trim()
    .min(10, "Describe the target audience in at least 10 characters")
    .max(2000),
  objective: z.string().trim().max(2000).optional(),
  context: z.string().trim().max(4000).optional(),
  tier: z.enum(RUN_TIERS),
  grounding: z.boolean(),
  discussion: z.boolean().optional().default(false),
  personaBudget: z.number().int().min(3).max(200).nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid run request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [{ db, runs }, { startRun }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/engine/orchestrator"),
  ]);

  const {
    productName,
    description,
    targetAudience,
    objective,
    context,
    tier,
    grounding,
    discussion,
    personaBudget,
  } = parsed.data;
  const [row] = await db
    .insert(runs)
    .values({
      idea: description,
      productName,
      targetAudience,
      objective: objective ? objective : null,
      context: context ? context : null,
      tier,
      grounding,
      discussion,
      personaBudget: personaBudget ?? null,
      status: "pending",
      estCostUsd: estimateRunCost(tier, grounding, discussion, personaBudget).toFixed(4),
    })
    .returning({ id: runs.id });

  startRun(row.id);

  return Response.json({ runId: row.id }, { status: 201 });
}

export async function GET() {
  const { db, runs } = await import("@/lib/db");
  const rows = await db.select().from(runs).orderBy(desc(runs.createdAt));
  return Response.json({ runs: rows });
}
