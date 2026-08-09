import { NextResponse } from "next/server";
import { createCampaign, listCampaigns } from "@/lib/campaign";
import { CampaignBriefSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ campaigns: listCampaigns() });
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = CampaignBriefSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid brief", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const campaign = await createCampaign(parsed.data);
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("[api/campaign] generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 },
    );
  }
}
