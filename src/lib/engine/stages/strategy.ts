import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { isMock } from "@/lib/llm/client";
import {
  STRATEGY_DIRECTIONS,
  strategyInvalidCohortsRetrySuffix,
  strategyPrompt,
} from "@/lib/prompts/strategy";
import type { MarketingBrief } from "@/lib/schemas/brief";
import { CampaignStrategySchema, type CampaignStrategy } from "@/lib/schemas/marketing";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Strategy generation: three parallel strategists, one per creative
// direction, all children of framing. Strategy ids are forced to stable
// "strategy_<i>" values in code — model-invented ids (and mock ids) are not
// trusted anywhere downstream.
// ---------------------------------------------------------------------------

export interface StrategyStageResult {
  strategies: CampaignStrategy[];
  /** agent_runs id per strategy, index-aligned — race reactions parent here. */
  strategyAgentIds: string[];
}

export async function runStrategyStage(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  framingAgentId: string,
): Promise<StrategyStageResult> {
  const validCohorts = new Set(brief.cohorts.map((c) => c.name));

  const results = await Promise.all(
    STRATEGY_DIRECTIONS.map(async (direction, index) => {
      const { system, prompt } = strategyPrompt({
        productName: run.productName ?? run.idea.slice(0, 80),
        description: run.idea,
        objective: run.objective,
        brief,
        direction,
      });

      try {
      const { agentRunId, output } = await executeAgent({
        ctx,
        kind: "strategy",
        label: `Strategist · ${direction.label}`,
        parentAgentRunId: framingAgentId,
        role: "reasoner",
        schema: CampaignStrategySchema,
        system,
        prompt,
        effort: "high",
        // One re-ask when the strategy targets unknown cohorts (real mode only
        // — mock strategies always reference fake cohorts and get clamped).
        reask: isMock()
          ? undefined
          : (strategy) => {
              const invalid = strategy.targetCohortIds.filter((c) => !validCohorts.has(c));
              return invalid.length > 0
                ? strategyInvalidCohortsRetrySuffix(invalid, [...validCohorts])
                : null;
            },
      });

      // Force stable ids and valid cohort targets regardless of what the
      // model (or mock) produced.
      const targetCohortIds = output.targetCohortIds.filter((c) => validCohorts.has(c));
      const strategy: CampaignStrategy = {
        ...output,
        id: `strategy_${index}`,
        targetCohortIds: targetCohortIds.length > 0 ? targetCohortIds : [...validCohorts],
      };
      return { strategy, agentRunId };
      } catch (error) {
        // A single direction dying (e.g. an upstream constrained-decoding 500
        // that survives retries) must not kill the race: the row is already
        // marked failed by executeAgent; race with the survivors.
        if (ctx.signal.aborted) throw error;
        console.error(`[strategy] ${direction.label} failed after retries:`, error);
        return null;
      }
    }),
  );

  const survivors = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (survivors.length < 2) {
    throw new Error(
      `strategy_failures: only ${survivors.length}/${STRATEGY_DIRECTIONS.length} strategies generated — need at least 2 to race`,
    );
  }

  const strategies = survivors.map((r) => r.strategy);
  await db
    .update(runs)
    .set({ strategies: strategies as unknown as Record<string, unknown> })
    .where(eq(runs.id, run.id));

  return { strategies, strategyAgentIds: survivors.map((r) => r.agentRunId) };
}
