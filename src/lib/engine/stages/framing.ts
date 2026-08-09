import { eq } from "drizzle-orm";

import { db, runs, type Run } from "@/lib/db";
import { TIER_SHAPE } from "@/lib/llm/cost";
import { framingPrompt } from "@/lib/prompts/framing";
import { BriefSchema, type Brief } from "@/lib/schemas/brief";
import { executeAgent, type AgentContext } from "../agent";

export interface FramingResult {
  brief: Brief;
  framingAgentId: string;
}

/** Research director designs the study; the brief is persisted on the run row. */
export async function runFramingStage(ctx: AgentContext, run: Run): Promise<FramingResult> {
  const segmentCount = TIER_SHAPE[run.tier].planners;
  const { system, prompt } = framingPrompt({
    idea: run.idea,
    context: run.context,
    // Brief schema caps segments at 8; deep tier's 8 planners fit exactly.
    segmentCount: Math.min(segmentCount, 8),
  });

  const { agentRunId, output } = await executeAgent({
    ctx,
    kind: "framing",
    label: "Research Director",
    parentAgentRunId: null,
    role: "reasoner",
    schema: BriefSchema,
    system,
    prompt,
    effort: "high",
  });

  await db.update(runs).set({ brief: output }).where(eq(runs.id, run.id));
  return { brief: output, framingAgentId: agentRunId };
}
