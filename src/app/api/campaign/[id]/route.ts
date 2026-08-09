import { NextResponse } from "next/server";
import { getCampaign, listItems } from "@/lib/campaign";
import { providerStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const campaign = getCampaign(params.id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    campaign,
    items: listItems(params.id),
    provider: providerStatus(),
  });
}
