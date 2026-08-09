import { NextResponse } from "next/server";
import { generateTimeline, getCampaign, listItems } from "@/lib/campaign";
import { FindingsReportSchema } from "@/lib/schemas";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  campaignId: z.string(),
  strategyId: z.string(),
  findings: FindingsReportSchema,
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { campaignId, strategyId, findings } = parsed.data;

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const strategy = campaign.strategies?.find((s) => s.id === strategyId);
  if (!strategy) return NextResponse.json({ error: "strategy not found" }, { status: 404 });

  try {
    const count = await generateTimeline(campaign, strategy, findings);
    return NextResponse.json({ count, items: listItems(campaignId) });
  } catch (err) {
    console.error("[api/timeline] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "timeline generation failed" },
      { status: 500 },
    );
  }
}
