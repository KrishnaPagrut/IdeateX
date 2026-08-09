import { z } from "zod";

import { RUN_TIERS } from "@/lib/db/schema";
import { estimateRunCost } from "@/lib/llm/cost";

export const runtime = "nodejs";

const EstimateSchema = z.object({
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

  const parsed = EstimateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid estimate request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return Response.json({ usd: estimateRunCost(parsed.data.tier, parsed.data.grounding, parsed.data.discussion, parsed.data.personaBudget) });
}
