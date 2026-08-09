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
  idea: z.string().trim().min(20, "Describe the idea in at least 20 characters"),
  context: z.string().trim().max(4000).optional(),
  tier: z.enum(RUN_TIERS),
  grounding: z.boolean(),
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

  const { idea, context, tier, grounding } = parsed.data;
  const [row] = await db
    .insert(runs)
    .values({
      idea,
      context: context ? context : null,
      tier,
      grounding,
      status: "pending",
      estCostUsd: estimateRunCost(tier, grounding).toFixed(4),
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
