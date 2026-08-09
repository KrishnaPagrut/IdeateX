import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { synthesisPrompt, type QuoteForSynthesis } from "@/lib/prompts/synthesis";
import type { MarketingBrief } from "@/lib/schemas/brief";
import { SynthesisSchema, type Synthesis } from "@/lib/schemas/synthesis";
import type { Aggregates, VerdictRecord } from "../aggregate";
import { executeAgent, type AgentContext } from "../agent";
import type { CritiqueResult } from "./critique";

// ---------------------------------------------------------------------------
// Synthesis: the founder-facing readout. Fed the brief, aggregates, both
// critiques, and ~15 best verbatim quotes (highest-confidence, spread
// round-robin across segments so no segment dominates the narrative).
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
  aggregates: Aggregates,
  critiques: CritiqueResult,
  records: VerdictRecord[],
  framingAgentId: string,
  discussionNote = "",
): Promise<Synthesis> {
  const { system, prompt: basePrompt } = synthesisPrompt({
    idea: run.idea,
    context: run.context,
    brief,
    aggregates,
    methodologyCritique: critiques.methodology,
    redTeamCritique: critiques.redteam,
    quotes: selectQuotes(records),
  });
  const prompt = discussionNote ? `${basePrompt}\n\n${discussionNote}` : basePrompt;

  const { output } = await executeAgent({
    ctx,
    kind: "synthesis",
    label: "Synthesis",
    parentAgentRunId: framingAgentId,
    role: "reasoner",
    schema: SynthesisSchema,
    system,
    prompt,
    effort: "high",
  });

  await db.update(runs).set({ synthesis: output }).where(eq(runs.id, run.id));
  return output;
}
