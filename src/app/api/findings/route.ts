import { NextResponse } from "next/server";
import { deriveFindings, getCampaign } from "@/lib/campaign";
import { SimulationResultSchema } from "@/lib/schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  campaignId: z.string(),
  results: z.array(SimulationResultSchema).min(1),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", detail: parsed.error.flatten() }, { status: 400 });
  }
  const campaign = getCampaign(parsed.data.campaignId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    return NextResponse.json({ findings: deriveFindings(campaign, parsed.data.results) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "findings failed" },
      { status: 500 },
    );
  }
}
