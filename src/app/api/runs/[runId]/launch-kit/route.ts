import { asc, eq } from "drizzle-orm";

import { timelinePrompt } from "@/lib/prompts/timeline";
import type { MarketingBrief } from "@/lib/schemas/brief";
import {
  GeneratedTimelineSchema,
  type CampaignItemKind,
  type CampaignItemSnapshot,
  type GeneratedTimeline,
} from "@/lib/schemas/launch";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
  Platform,
} from "@/lib/schemas/marketing";
import type { MarketingReport } from "@/lib/schemas/report";
import type { CampaignItemRow } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db imported lazily inside the handlers — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSnapshot(row: CampaignItemRow): CampaignItemSnapshot {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind as CampaignItemKind,
    state: row.state,
    title: row.title,
    body: row.body,
    dayOffset: row.dayOffset,
    platform: row.platform as Platform,
    targetCohorts: row.targetCohorts,
    purpose: row.purpose,
    callToAction: row.callToAction,
    hashtags: row.hashtags,
    imagePrompt: row.imagePrompt,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Order the plan by dayOffset and anchor it: every launch kit has a launch
 * day, so if the model produced no dayOffset-0 item, the item closest to 0 is
 * snapped onto it.
 */
function normalizeTimeline(timeline: GeneratedTimeline): GeneratedTimeline["items"] {
  const items = [...timeline.items];
  if (!items.some((i) => i.dayOffset === 0)) {
    const closest = items.reduce((best, i) =>
      Math.abs(i.dayOffset) < Math.abs(best.dayOffset) ? i : best,
    );
    closest.dayOffset = 0;
  }
  return items.sort((a, b) => a.dayOffset - b.dayOffset);
}

export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/launch-kit">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const { db, runs, campaignItems } = await import("@/lib/db");

  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "completed") {
    return Response.json(
      { error: `Run is ${run.status}; a launch kit needs a completed run` },
      { status: 409 },
    );
  }

  const brief = run.brief as MarketingBrief | null;
  const strategies = run.strategies as CampaignStrategy[] | null;
  const advisorReport = run.advisorReport as {
    consensus: AdvisorConsensus;
    verdicts: AdvisorVerdict[];
  } | null;
  const synthesis = run.synthesis as MarketingReport | null;
  if (!brief || !strategies?.length || !advisorReport || !synthesis) {
    return Response.json(
      { error: "Run is missing artifacts (brief/strategies/advisorReport/synthesis)" },
      { status: 409 },
    );
  }

  // Idempotent: a kit already exists — return it instead of generating twice.
  const existing = await db
    .select()
    .from(campaignItems)
    .where(eq(campaignItems.runId, runId))
    .orderBy(asc(campaignItems.sortOrder));
  if (existing.length) {
    return Response.json(
      { error: "Launch kit already generated", items: existing.map(toSnapshot) },
      { status: 409 },
    );
  }

  // The advisor consensus names the winner; fall back to the first strategy if
  // the id doesn't resolve (defensive — mock consensus ids are synthetic).
  const winner =
    strategies.find((s) => s.id === advisorReport.consensus.winnerStrategyId) ?? strategies[0];

  const { generate } = await import("@/lib/llm/client");
  const { system, prompt } = timelinePrompt({
    productName: run.productName ?? "The product",
    description: run.idea,
    objective: run.objective,
    brief,
    winner,
    consensus: advisorReport.consensus,
    verdicts: advisorReport.verdicts,
    synthesis,
  });

  // ONE reasoner call; schema misses are stochastic, so one re-sample.
  let timeline: GeneratedTimeline | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2 && !timeline; attempt++) {
    try {
      const result = await generate({
        role: "reasoner",
        schema: GeneratedTimelineSchema,
        system,
        prompt,
        effort: "medium",
      });
      timeline = result.object;
    } catch (error) {
      lastError = error;
    }
  }
  if (!timeline) {
    console.error("[launch-kit] timeline generation failed:", lastError);
    return Response.json({ error: "Timeline generation failed" }, { status: 502 });
  }

  const ordered = normalizeTimeline(timeline);

  // Re-check before insert: a concurrent POST may have won the race.
  const raced = await db
    .select()
    .from(campaignItems)
    .where(eq(campaignItems.runId, runId))
    .orderBy(asc(campaignItems.sortOrder));
  if (raced.length) {
    return Response.json(
      { error: "Launch kit already generated", items: raced.map(toSnapshot) },
      { status: 409 },
    );
  }

  const rows = await db
    .insert(campaignItems)
    .values(
      ordered.map((item, i) => ({
        runId,
        kind: item.kind,
        title: item.title,
        body: item.body,
        dayOffset: item.dayOffset,
        platform: item.platform,
        targetCohorts: item.targetCohorts,
        purpose: item.purpose,
        callToAction: item.callToAction,
        hashtags: item.hashtags,
        imagePrompt: item.imagePrompt,
        sortOrder: i,
      })),
    )
    .returning();

  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return Response.json({ items: rows.map(toSnapshot) }, { status: 201 });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]/launch-kit">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const { db, runs, campaignItems } = await import("@/lib/db");

  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(campaignItems)
    .where(eq(campaignItems.runId, runId))
    .orderBy(asc(campaignItems.sortOrder));

  return Response.json({ items: rows.map(toSnapshot) });
}
