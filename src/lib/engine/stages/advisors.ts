import { xai } from "@ai-sdk/xai";
import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { isMock } from "@/lib/llm/client";
import { ADVISOR_LENSES, advisorPrompt, moderatorPrompt } from "@/lib/prompts/advisors";
import type { MarketingBrief } from "@/lib/schemas/brief";
import {
  AdvisorConsensusSchema,
  AdvisorVerdictSchema,
  type AdvisorConsensus,
  type AdvisorVerdict,
  type CampaignStrategy,
  type RaceResult,
} from "@/lib/schemas/marketing";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Advisor panel (replaces the critics): three expert lenses read ALL race
// results in parallel, then a moderator synthesizes the consensus winner and
// the directive list the campaign content must honor. Advisors act on the
// sim's public-consensus signal; individual advisor failures are tolerated
// (minimum two verdicts), and an invalid moderator winner falls back to the
// race scores in code — mock mode always takes that fallback.
// ---------------------------------------------------------------------------

export interface AdvisorStageResult {
  consensus: AdvisorConsensus;
  verdicts: AdvisorVerdict[];
}

const MIN_VERDICTS = 2;

/** Deterministic winner from race scores, used when the moderator's pick is invalid. */
export function scoreFallbackWinner(race: RaceResult[]): string {
  let best = race[0];
  for (const r of race) {
    const score = (x: RaceResult) =>
      x.scores.purchaseIntent + x.scores.audienceFit - x.scores.brandSafetyRisk / 2;
    if (score(r) > score(best)) best = r;
  }
  return best.strategyId;
}

export async function runAdvisorStage(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  strategies: CampaignStrategy[],
  race: RaceResult[],
  framingAgentId: string,
): Promise<AdvisorStageResult> {
  const grounded = run.grounding && !isMock();
  // Server-side search tools can't run in mock mode, and grok's search tools
  // don't mix with an explicit reasoningEffort — omit effort when attached.
  const tools = grounded
    ? { web_search: xai.tools.webSearch(), x_search: xai.tools.xSearch() }
    : undefined;

  const productName = run.productName ?? run.idea.slice(0, 80);

  const settled = await Promise.allSettled(
    ADVISOR_LENSES.map((lens) => {
      const { system, prompt } = advisorPrompt({
        productName,
        brief,
        strategies,
        race,
        lens,
        grounded,
      });
      return executeAgent({
        ctx,
        kind: "advisor",
        label: lens.label,
        parentAgentRunId: framingAgentId,
        role: "reasoner",
        schema: AdvisorVerdictSchema,
        system,
        prompt,
        effort: tools ? undefined : "high",
        tools,
      });
    }),
  );

  const aborted = settled.find(
    (s) => s.status === "rejected" && s.reason instanceof DOMException,
  );
  if (aborted && ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");

  const verdicts = settled
    .filter(
      (s): s is PromiseFulfilledResult<{ agentRunId: string; output: AdvisorVerdict }> =>
        s.status === "fulfilled",
    )
    .map((s) => s.value.output);

  if (verdicts.length < MIN_VERDICTS) {
    const reasons = settled
      .filter((s): s is PromiseRejectedResult => s.status === "rejected")
      .map((s) => (s.reason instanceof Error ? s.reason.message : String(s.reason)));
    throw new Error(`advisor_failures: only ${verdicts.length} advisors returned (${reasons.join("; ")})`);
  }

  const { system, prompt } = moderatorPrompt({
    productName,
    brief,
    strategies,
    race,
    verdicts,
  });
  const moderator = await executeAgent({
    ctx,
    kind: "moderator",
    label: "Panel Moderator",
    parentAgentRunId: framingAgentId,
    role: "reasoner",
    schema: AdvisorConsensusSchema,
    system,
    prompt,
    effort: "high",
  });

  let consensus = moderator.output;
  const validIds = new Set(strategies.map((s) => s.id));
  if (!validIds.has(consensus.winnerStrategyId)) {
    // Mock outputs (and the occasional real slip) can't name a real id — the
    // race scores decide instead, and the rationale says so.
    consensus = {
      ...consensus,
      winnerStrategyId: scoreFallbackWinner(race),
      rationale: `${consensus.rationale} (winner resolved by score fallback)`,
    };
  }

  await db
    .update(runs)
    .set({ advisorReport: { consensus, verdicts } as unknown as Record<string, unknown> })
    .where(eq(runs.id, run.id));

  return { consensus, verdicts };
}
