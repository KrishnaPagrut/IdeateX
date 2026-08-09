import { NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign } from "@/lib/campaign";
import { getBuildPlan, runCto } from "@/lib/cto/service";
import { CompanySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  companyId: z.string(),
  objective: z.string().min(1),
});

export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  return NextResponse.json({ buildPlan: getBuildPlan(companyId) });
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", detail: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = getCampaign(parsed.data.companyId);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The company record is still stored as a campaign brief; map it across.
  const company = CompanySchema.parse({
    name: campaign.brief.productName,
    idea: campaign.brief.productDescription,
    url: campaign.brief.productUrl ?? "",
    stage: "idea",
    targetMarket: campaign.brief.targetMarket,
    context: campaign.brief.objective,
  });

  try {
    const result = await runCto(parsed.data.companyId, company, parsed.data.objective);
    return NextResponse.json({ buildPlan: result });
  } catch (err) {
    console.error("[api/cto] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CTO run failed" },
      { status: 500 },
    );
  }
}
