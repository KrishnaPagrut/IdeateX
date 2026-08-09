/**
 * Campaign service — the generation pipeline and its persistence.
 *
 * The pipeline is the product: brief → research → audience → strategies →
 * simulation → findings → timeline. Each stage is persisted so the UI can
 * reload mid-demo without losing state.
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { ai } from "./ai";
import { hashSeed } from "./ai/rng";
import { db, schema } from "./db";
import { buildPopulation } from "./audience";
import {
  AudienceDesignSchema,
  CampaignStrategySchema,
  GeneratedTimelineSchema,
  ResearchReportSchema,
  type CampaignBrief,
  type CampaignStrategy,
  type Finding,
  type FindingsReport,
  type ResearchReport,
  type SimulationResult,
  type SyntheticAudience,
} from "./schemas";

export type CampaignRecord = {
  id: string;
  brief: CampaignBrief;
  research: ResearchReport | null;
  audience: SyntheticAudience | null;
  strategies: CampaignStrategy[] | null;
  selectedStrategyId: string | null;
  status: string;
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getCampaign(id: string): CampaignRecord | null {
  const row = db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    brief: JSON.parse(row.brief) as CampaignBrief,
    research: parseJson<ResearchReport>(row.research),
    audience: parseJson<SyntheticAudience>(row.audience),
    strategies: parseJson<CampaignStrategy[]>(row.strategies),
    selectedStrategyId: row.selectedStrategyId,
    status: row.status,
  };
}

export function listCampaigns() {
  return db
    .select({
      id: schema.campaigns.id,
      productName: schema.campaigns.productName,
      status: schema.campaigns.status,
      createdAt: schema.campaigns.createdAt,
    })
    .from(schema.campaigns)
    .all();
}

/**
 * Stage 1-3: research the category, synthesise an audience, generate three
 * strategies. Run as one call because they're strictly sequential and each
 * feeds the next — splitting them would just add round trips.
 */
export async function createCampaign(brief: CampaignBrief): Promise<CampaignRecord> {
  const id = nanoid(10);
  const seed = hashSeed(`${brief.productName}:${brief.objective}`);

  db.insert(schema.campaigns)
    .values({
      id,
      productName: brief.productName,
      brief: JSON.stringify(brief),
      status: "researching",
    })
    .run();

  const research = await ai.structured(
    ResearchReportSchema,
    "You are a market researcher. Analyse the product category and the public conversation around it. Report aggregate patterns only.",
    `Product: ${brief.productName}\nDescription: ${brief.productDescription}\nTarget market: ${brief.targetMarket}\nObjective: ${brief.objective}`,
    { task: "research", seed, search: "both", context: { brief } },
  );

  // The model designs cohorts; the population is sampled from them in code.
  const design = await ai.structured(
    AudienceDesignSchema,
    [
      "You design synthetic audience cohorts from aggregate behavioural patterns.",
      "CRITICAL: every cohort is a FICTIONAL ARCHETYPE describing a group tendency.",
      "Never model, name, or describe an identifiable real person.",
      "Give each cohort a distinct hex colour and make their baselines genuinely different —",
      "cohorts that all share similar skepticism and humor produce a useless simulation.",
    ].join(" "),
    `Design 4 cohorts for:\nProduct: ${brief.productName} — ${brief.productDescription}\nMarket: ${brief.targetMarket}\nResearch: ${research.categorySummary}\nObserved tensions: ${research.observedTensions.join("; ")}\nCohort ids must be c_0, c_1, c_2, c_3. populationShare values should sum to 1.`,
    { task: "audience", seed, context: { brief, research } },
  );

  const audience = buildPopulation(design.cohorts, seed);

  const strategies = await ai.structured(
    z.array(CampaignStrategySchema).length(3),
    "You are a campaign strategist. Produce three genuinely distinct strategies — different positioning, different cohort targeting, different creative register. They must not be three phrasings of one idea.",
    `Product: ${brief.productName}\nObjective: ${brief.objective}\nBrand voice: ${brief.brandVoice}\nThemes: ${brief.themes.join(", ")}\nPlatforms: ${brief.platforms.join(", ")}\nCohorts: ${audience.cohorts.map((c) => `${c.id}=${c.name}`).join(", ")}`,
    { task: "strategies", seed, context: { brief, audience, research } },
  );

  // Images are deliberately NOT generated here. They're the slowest step by
  // far, and blocking on them would leave the user staring at a spinner. The
  // client opens /api/images once the page renders and they stream in.
  db.update(schema.campaigns)
    .set({
      research: JSON.stringify(research),
      audience: JSON.stringify(audience),
      strategies: JSON.stringify(strategies),
      status: "ready",
    })
    .where(eq(schema.campaigns.id, id))
    .run();

  return { id, brief, research, audience, strategies, selectedStrategyId: null, status: "ready" };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Derive findings from completed simulation results.
 *
 * Deliberately computed from the simulation data rather than asked of the LLM
 * freehand: a finding must be traceable to cohort numbers and events, or it is
 * just plausible-sounding marketing advice with no evidence behind it.
 */
export function deriveFindings(
  campaign: CampaignRecord,
  results: SimulationResult[],
): FindingsReport {
  const audience = campaign.audience;
  if (!audience) throw new Error("campaign has no audience");

  const cohortName = (cid: string) =>
    audience.cohorts.find((c) => c.id === cid)?.name ?? cid;

  const ranked = [...results].sort(
    (a, b) =>
      b.scores.purchaseIntent + b.scores.trust - (a.scores.purchaseIntent + a.scores.trust),
  );
  const winner = ranked[0];
  const strategyName = (sid: string) =>
    campaign.strategies?.find((s) => s.id === sid)?.name ?? sid;

  const findings: Finding[] = [];
  const push = (f: Omit<Finding, "id">) => findings.push({ id: `fd_${findings.length}`, ...f });

  // Per-cohort wins and losses in the winning run.
  winner.cohortBreakdown.forEach((c) => {
    if (c.sentiment >= 0.35) {
      push({
        kind: "worked",
        headline: `${cohortName(c.cohortId)} responded strongly`,
        detail: `Sentiment settled at ${c.sentiment >= 0 ? "+" : ""}${c.sentiment.toFixed(2)} with purchase intent at ${c.purchaseIntent}. This cohort is the campaign's centre of gravity.`,
        cohortIds: [c.cohortId],
        axis: "purchaseIntent",
        weight: Math.min(1, 0.5 + c.sentiment / 2),
        evidenceEventIds: [],
        directive: `Lead with the winning angle for ${cohortName(c.cohortId)}; give this cohort the highest share of the content mix.`,
      });
    }
    if (c.sentiment <= -0.1) {
      push({
        kind: "failed",
        headline: `${cohortName(c.cohortId)} did not come along`,
        detail: `Sentiment finished at ${c.sentiment.toFixed(2)} and intent at ${c.purchaseIntent}. The winning creative register actively works against this cohort.`,
        cohortIds: [c.cohortId],
        axis: "audienceFit",
        weight: Math.min(1, 0.4 + Math.abs(c.sentiment)),
        evidenceEventIds: [],
        directive: `Write dedicated assets for ${cohortName(c.cohortId)} in a different register — do not reuse the winning copy for them.`,
      });
    }
    if (c.sentiment > -0.1 && c.sentiment < 0.15) {
      push({
        kind: "opportunity",
        headline: `${cohortName(c.cohortId)} stayed neutral`,
        detail: `Reached but unmoved (sentiment ${c.sentiment.toFixed(2)}). Indifference is usually a comprehension problem, not a persuasion one.`,
        cohortIds: [c.cohortId],
        axis: "messageComprehension",
        weight: 0.5,
        evidenceEventIds: [],
        directive: `Add an explanatory asset targeting ${cohortName(c.cohortId)} that states the concrete outcome before any brand voice.`,
      });
    }
  });

  // Cross-strategy comparisons — what the losing runs reveal.
  const bestComprehension = [...results].sort(
    (a, b) => b.scores.messageComprehension - a.scores.messageComprehension,
  )[0];
  if (bestComprehension.strategyId !== winner.strategyId) {
    push({
      kind: "opportunity",
      headline: `"${strategyName(bestComprehension.strategyId)}" explained the product better`,
      detail: `It scored ${bestComprehension.scores.messageComprehension} on comprehension versus the winner's ${winner.scores.messageComprehension}. Its explanatory structure is worth borrowing even though it lost overall.`,
      cohortIds: [],
      axis: "messageComprehension",
      weight: 0.65,
      evidenceEventIds: [],
      directive: "Include at least one long-form explanatory asset built on the losing strategy's structure.",
    });
  }

  const riskiest = [...results].sort((a, b) => b.scores.brandSafetyRisk - a.scores.brandSafetyRisk)[0];
  if (riskiest.scores.brandSafetyRisk >= 35) {
    push({
      kind: "risk",
      headline: `"${strategyName(riskiest.strategyId)}" carried elevated brand-safety risk`,
      detail: `Brand-safety risk of ${riskiest.scores.brandSafetyRisk} with controversy at ${riskiest.scores.controversy}, driven by detractor activity in the run.`,
      cohortIds: [],
      axis: "brandSafetyRisk",
      weight: 0.7,
      evidenceEventIds: [],
      directive: "Prepare response templates for the top objection before launch day.",
    });
  }

  // Narratives that formed are the most quotable evidence in the whole demo.
  winner.narratives.slice(0, 3).forEach((n) => {
    push({
      kind: n.sentiment >= 0 ? "worked" : "risk",
      headline: `Narrative formed: "${n.label}"`,
      detail: `Carried by ${n.carrierIds.length} personas from tick ${n.firstSeenTick}, momentum ${n.momentum.toFixed(1)}.`,
      cohortIds: [],
      axis: n.sentiment >= 0 ? "sharePropensity" : "trust",
      weight: Math.min(1, n.momentum / 30),
      evidenceEventIds: [],
      directive:
        n.sentiment >= 0
          ? `Reinforce "${n.label}" — make it an explicit content pillar.`
          : `Address "${n.label}" directly in an early asset rather than letting it compound.`,
    });
  });

  const whyItWon = [
    `"${strategyName(winner.strategyId)}" won on combined trust (${winner.scores.trust}) and purchase intent (${winner.scores.purchaseIntent}).`,
    `It reached ${winner.scores.reach}% of the synthetic audience with ${winner.scores.messageComprehension} comprehension`,
    `and the lowest brand-safety risk of the three at ${winner.scores.brandSafetyRisk}.`,
  ].join(" ");

  return {
    campaignId: campaign.id,
    winningStrategyId: winner.strategyId,
    whyItWon,
    findings,
    carryOver: results
      .filter((r) => r.strategyId !== winner.strategyId)
      .map((r) => `From "${strategyName(r.strategyId)}": ${r.explanation}`),
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Expand the selected strategy into dated campaign items, conditioned on the
 * findings. The directives are passed in as hard constraints so the timeline
 * is visibly a consequence of the simulation.
 */
export async function generateTimeline(
  campaign: CampaignRecord,
  strategy: CampaignStrategy,
  findings: FindingsReport,
) {
  const seed = hashSeed(`${campaign.id}:${strategy.id}:timeline`);

  const generated = await ai.structured(
    GeneratedTimelineSchema,
    [
      "You expand a campaign strategy into a concrete, dated execution plan.",
      "You MUST honour every directive from the simulation findings — they are constraints, not suggestions.",
      "Produce a realistic mix across the launch window: teasers before launch, a launch-day cluster, and follow-ups after.",
    ].join(" "),
    [
      `Product: ${campaign.brief.productName}`,
      `Launch date: ${campaign.brief.launchDate}`,
      `Strategy: ${strategy.name} — ${strategy.positioningThesis}`,
      `Central message: ${strategy.centralMessage}`,
      `Platforms: ${campaign.brief.platforms.join(", ")}`,
      "",
      "DIRECTIVES FROM SIMULATION:",
      ...findings.findings.map((f) => `- [${f.kind}] ${f.headline}: ${f.directive}`),
    ].join("\n"),
    { task: "timeline", seed, context: { brief: campaign.brief, campaign, strategy, findings } },
  );

  // As with strategies, images stream in afterwards via /api/images rather
  // than blocking the timeline from appearing.
  const rows = generated.items.map((item, i) => ({
    id: nanoid(10),
    campaignId: campaign.id,
    kind: item.kind,
    role: "cmo",
    state: "draft" as const,
    title: item.title,
    body: item.body,
    scheduledAt: item.scheduledAt,
    platform: item.platform,
    targetCohortIds: JSON.stringify(item.targetCohortIds),
    purpose: item.purpose,
    callToAction: item.callToAction ?? null,
    hashtags: JSON.stringify(item.hashtags),
    imagePrompt: item.imagePrompt ?? null,
    imageUrl: item.imageUrl ?? null,
    imageVariants: "[]",
    form: item.form ? JSON.stringify(item.form) : null,
    linkedItemIds: "[]",
    version: 0,
    sortOrder: i,
  }));

  // Scoped to this role — regenerating the campaign must not wipe the CTO's
  // artifacts for the same company.
  db.delete(schema.campaignItems)
    .where(
      and(eq(schema.campaignItems.campaignId, campaign.id), eq(schema.campaignItems.role, "cmo")),
    )
    .run();
  if (rows.length) db.insert(schema.campaignItems).values(rows).run();
  db.update(schema.campaigns)
    .set({ selectedStrategyId: strategy.id, status: "timeline" })
    .where(eq(schema.campaigns.id, campaign.id))
    .run();

  return rows.length;
}

export function listItems(campaignId: string) {
  return db
    .select()
    .from(schema.campaignItems)
    .where(eq(schema.campaignItems.campaignId, campaignId))
    .all()
    .map((r) => ({
      ...r,
      targetCohortIds: JSON.parse(r.targetCohortIds) as string[],
      hashtags: JSON.parse(r.hashtags) as string[],
      imageVariants: JSON.parse(r.imageVariants) as string[],
      linkedItemIds: JSON.parse(r.linkedItemIds) as string[],
      form: parseJson<Record<string, unknown>>(r.form),
    }))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export type TimelineItem = ReturnType<typeof listItems>[number];

/** Snapshot before mutating, so every edit is undoable. */
export function saveVersion(itemId: string, changeSource: string, summary?: string) {
  const current = db
    .select()
    .from(schema.campaignItems)
    .where(eq(schema.campaignItems.id, itemId))
    .get();
  if (!current) return null;
  db.insert(schema.itemVersions)
    .values({
      id: nanoid(12),
      itemId,
      version: current.version,
      snapshot: JSON.stringify(current),
      changeSource,
      changeSummary: summary ?? null,
    })
    .run();
  return current;
}
