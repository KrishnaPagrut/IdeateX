import { xai } from "@ai-sdk/xai";

import type { Run } from "@/lib/db";
import { isMock } from "@/lib/llm/client";
import { methodologyCritiquePrompt, redTeamCritiquePrompt } from "@/lib/prompts/critique";
import type { Brief } from "@/lib/schemas/brief";
import { CritiqueSchema, type Critique } from "@/lib/schemas/critique";
import type { Aggregates, VerdictRecord } from "../aggregate";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Critique: two parallel critics, both children of framing. The methodology
// critic attacks the study; the red-team critic attacks the idea (grounded
// via xAI server-side search tools when run.grounding is on — skipped in
// mock mode, where server-side tools cannot run).
// ---------------------------------------------------------------------------

export interface CritiqueResult {
  methodology: Critique;
  redteam: Critique;
}

const VERDICT_SAMPLE_SIZE = 10;

/** Evenly-spaced sample across the adoption spectrum, not just the extremes. */
function sampleVerdicts(records: VerdictRecord[], n: number): VerdictRecord[] {
  if (records.length <= n) return records;
  const sorted = [...records].sort(
    (a, b) => a.verdict.adoptionLikelihood - b.verdict.adoptionLikelihood,
  );
  const step = (sorted.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => sorted[Math.round(i * step)]);
}

export async function runCritiqueStage(
  ctx: AgentContext,
  run: Run,
  brief: Brief,
  aggregates: Aggregates,
  records: VerdictRecord[],
  framingAgentId: string,
  discussionNote = "",
): Promise<CritiqueResult> {
  const grounded = run.grounding && !isMock();
  // Server-side tools can't be combined with mock mode; and grok's search
  // tools don't mix with an explicit reasoningEffort, so omit effort when
  // tools are attached.
  const tools = grounded
    ? { web_search: xai.tools.webSearch(), x_search: xai.tools.xSearch() }
    : undefined;

  const methodologyPrompts = methodologyCritiquePrompt({
    brief,
    aggregates,
    sampledVerdicts: sampleVerdicts(records, VERDICT_SAMPLE_SIZE),
  });
  const redteamPrompts = redTeamCritiquePrompt({
    brief,
    idea: run.idea,
    context: run.context,
    aggregates,
    grounded,
  });
  if (discussionNote) {
    methodologyPrompts.prompt += `\n\n${discussionNote}`;
    redteamPrompts.prompt += `\n\n${discussionNote}`;
  }

  const [methodology, redteam] = await Promise.all([
    executeAgent({
      ctx,
      kind: "critique",
      label: "Methodology Critic",
      parentAgentRunId: framingAgentId,
      role: "reasoner",
      schema: CritiqueSchema,
      system: methodologyPrompts.system,
      prompt: methodologyPrompts.prompt,
      effort: "high",
    }),
    executeAgent({
      ctx,
      kind: "critique",
      label: "Red-Team Critic",
      parentAgentRunId: framingAgentId,
      role: "reasoner",
      schema: CritiqueSchema,
      system: redteamPrompts.system,
      prompt: redteamPrompts.prompt,
      effort: tools ? undefined : "high",
      tools,
    }),
  ]);

  return { methodology: methodology.output, redteam: redteam.output };
}
