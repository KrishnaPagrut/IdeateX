import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { TIER_SHAPE } from "@/lib/llm/cost";
import { framingPrompt } from "@/lib/prompts/framing";
import { MarketingBriefSchema, type MarketingBrief } from "@/lib/schemas/brief";
import { executeAgent, type AgentContext } from "../agent";

export interface FramingResult {
  brief: MarketingBrief;
  framingAgentId: string;
}

/** Audience-research head designs the study; the brief is persisted on the run row. */
export async function runFramingStage(ctx: AgentContext, run: Run): Promise<FramingResult> {
  const cohortCount = TIER_SHAPE[run.tier].planners;
  const { system, prompt } = framingPrompt({
    productName: run.productName ?? run.idea.slice(0, 80),
    description: run.idea,
    targetAudience: run.targetAudience ?? "Not specified — infer a plausible audience from the product.",
    objective: run.objective,
    context: run.context,
    // Brief schema caps cohorts at 8; deep tier's 8 planners fit exactly.
    cohortCount: Math.min(cohortCount, 8),
  });

  const { agentRunId, output } = await executeAgent({
    ctx,
    kind: "framing",
    label: "Audience Research",
    parentAgentRunId: null,
    role: "reasoner",
    schema: MarketingBriefSchema,
    system,
    prompt,
    effort: "high",
  });

  await db.update(runs).set({ brief: output }).where(eq(runs.id, run.id));
  return { brief: output, framingAgentId: agentRunId };
}
