import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { synthesisPrompt, type QuoteForSynthesis } from "@/lib/prompts/synthesis";
import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
  RaceResult,
} from "@/lib/schemas/marketing";
import { MarketingReportSchema, type MarketingReport } from "@/lib/schemas/report";
import type { Aggregates, VerdictRecord } from "../aggregate";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Synthesis: the founder-facing marketing report. Fed the winner, the advisor
// consensus (whose directives are hard constraints on drafted content), all
// race results, the deep-swarm aggregates, and ~15 best verbatim quotes
// (highest-confidence, spread round-robin across cohorts).
// ---------------------------------------------------------------------------

const QUOTE_BUDGET = 15;

export function selectQuotes(records: VerdictRecord[], budget = QUOTE_BUDGET): QuoteForSynthesis[] {
  const bySegment = new Map<string, VerdictRecord[]>();
  for (const record of records) {
    const list = bySegment.get(record.segment) ?? [];
    list.push(record);
    bySegment.set(record.segment, list);
  }
  for (const list of bySegment.values()) {
    list.sort((a, b) => b.verdict.confidence - a.verdict.confidence);
  }

  const picked: VerdictRecord[] = [];
  const queues = [...bySegment.values()];
  while (picked.length < budget && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (picked.length >= budget) break;
      const next = queue.shift();
      if (next) picked.push(next);
    }
  }

  return picked.map((r) => ({
    personaName: r.personaName,
    archetype: r.archetype,
    segment: r.segment,
    adoptionLikelihood: r.verdict.adoptionLikelihood,
    quote: r.verdict.verbatimQuote,
  }));
}

export async function runSynthesisStage(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  winner: CampaignStrategy,
  consensus: AdvisorConsensus,
  verdicts: AdvisorVerdict[],
  race: RaceResult[],
  aggregates: Aggregates,
  records: VerdictRecord[],
  framingAgentId: string,
  discussionNote = "",
): Promise<MarketingReport> {
  const { system, prompt: basePrompt } = synthesisPrompt({
    productName: run.productName ?? run.idea.slice(0, 80),
    description: run.idea,
    objective: run.objective,
    context: run.context,
    brief,
    winner,
    consensus,
    verdicts,
    race,
    aggregates,
    quotes: selectQuotes(records),
  });
  const prompt = discussionNote ? `${basePrompt}\n\n${discussionNote}` : basePrompt;

  const { output } = await executeAgent({
    ctx,
    kind: "synthesis",
    label: "Campaign Report",
    parentAgentRunId: framingAgentId,
    role: "reasoner",
    schema: MarketingReportSchema,
    system,
    prompt,
    effort: "high",
  });

  await db.update(runs).set({ synthesis: output }).where(eq(runs.id, run.id));
  return output;
}
