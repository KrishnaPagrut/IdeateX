import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, runs, type Persona, type Run } from "@/lib/db";
import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  CampaignStrategy,
  RaceResult,
  SyntheticAudience,
} from "@/lib/schemas/marketing";
import { executeAgent, type AgentContext } from "../agent";
import { emitRunEvent } from "../events";
import { Simulation, seedFor, type ReactionFn, type SimEvent } from "../social/sim";

// ---------------------------------------------------------------------------
// The race: every strategy runs through the SAME frozen audience in a seeded
// tick simulation. Routine engagement is deterministic; only pivotal moments
// (high-influence member, strong opinion) escalate to the LLM, as `reaction`
// agent_runs parented to the strategy that provoked them. Each tick streams a
// compact sim:tick event so the live page can animate reach.
// ---------------------------------------------------------------------------

const TICKS = 28;
const LLM_BUDGET_PER_STRATEGY = 12;
const SAMPLE_REPLY_CAP = 12;

const ReactionSchema = z.object({
  reply: z
    .string()
    .max(280)
    .describe("The reply post, in this person's voice, platform-native, no hashtag spam"),
});

function reactionPrompt(args: {
  persona: Persona;
  cohortName: string;
  postBody: string;
  stance: string;
  strategyPost: string;
}): { system: string; prompt: string } {
  const p = args.persona;
  const system = [
    `You are ${p.name} — ${p.archetype}. ${p.backstory}`,
    `You are ${p.demographics.age}, ${p.demographics.occupation}, ${p.demographics.location}, income ${p.demographics.incomeBand}.`,
    `You are scrolling your feed and about to reply to a post about a product launch. Your current stance is: ${args.stance}.`,
    "Write ONE reply post (max 280 chars) exactly as this person would — their vocabulary, their platform habits, their attitude. No hashtag spam, no marketing voice, never break character.",
  ].join("\n");

  const prompt = [
    `# The launch campaign's original post\n${args.strategyPost}`,
    `# The post you are replying to\n${args.postBody}`,
    `Reply now, in character, stance: ${args.stance}.`,
  ].join("\n\n");

  return { system, prompt };
}

/** Extract representative replies from a finished sim's event log, LLM-backed first. */
export function sampleReplies(
  events: SimEvent[],
  cap = SAMPLE_REPLY_CAP,
): RaceResult["sampleReplies"] {
  const replies = events.filter((e) => e.type === "reply" && e.body);
  const ranked = [
    ...replies.filter((e) => e.llmBacked),
    // Strongest opinions first among canned replies, so detractors surface.
    ...replies
      .filter((e) => !e.llmBacked)
      .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment)),
  ];
  return ranked.slice(0, cap).map((e) => ({
    personaId: e.personaId,
    body: e.body ?? "",
    sentiment: Math.max(-1, Math.min(1, e.sentiment)),
    llmBacked: e.llmBacked,
  }));
}

export async function runRaceStage(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  audience: SyntheticAudience,
  strategies: CampaignStrategy[],
  strategyAgentIds: string[],
  personaById: Map<string, Persona>,
): Promise<RaceResult[]> {
  const results = await Promise.all(
    strategies.map((strategy, index) =>
      raceOne(ctx, run, brief, audience, strategy, strategyAgentIds[index], personaById),
    ),
  );

  await db
    .update(runs)
    .set({ race: results as unknown as Record<string, unknown> })
    .where(eq(runs.id, run.id));
  await emitRunEvent(run.id, "race:completed", { results });

  return results;
}

async function raceOne(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  audience: SyntheticAudience,
  strategy: CampaignStrategy,
  strategyAgentId: string,
  personaById: Map<string, Persona>,
): Promise<RaceResult> {
  const reaction: ReactionFn = async ({ personaId, post, stance }) => {
    const persona = personaById.get(personaId);
    if (!persona) throw new Error(`unknown persona ${personaId}`);
    const { system, prompt } = reactionPrompt({
      persona,
      cohortName: strategy.name,
      postBody: post.body,
      stance,
      strategyPost: strategy.sampleLaunchPost.body,
    });
    const { output } = await executeAgent({
      ctx,
      kind: "reaction",
      label: `${persona.name} · reaction`,
      parentAgentRunId: strategyAgentId,
      personaId,
      role: "swarm",
      schema: ReactionSchema,
      system,
      prompt,
    });
    return output.reply;
  };

  const sim = new Simulation(audience, brief.cohorts, strategy, {
    seed: seedFor(run.id, strategy.id),
    ticks: TICKS,
    llmBudget: LLM_BUDGET_PER_STRATEGY,
    reaction,
  });

  const previouslyActivated = new Set<string>();
  let last: ReturnType<Simulation["snapshot"]> | null = null;

  for await (const snap of sim.run()) {
    if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (ctx.meter.exceeded) throw new Error("cost_cap");
    last = snap;

    const newlyActivated = snap.activatedPersonaIds.filter((id) => !previouslyActivated.has(id));
    for (const id of newlyActivated) previouslyActivated.add(id);

    await emitRunEvent(run.id, "sim:tick", {
      strategyId: strategy.id,
      strategyName: strategy.name,
      tick: snap.tick,
      totalTicks: snap.totalTicks,
      scores: snap.scores,
      reachedCount: snap.activatedPersonaIds.length,
      personaCount: audience.members.length,
      activatedPersonaIds: newlyActivated,
      topNarratives: snap.narratives.slice(0, 4).map((n) => ({
        id: n.id,
        label: n.label,
        sentiment: n.sentiment,
        momentum: n.momentum,
      })),
    });
  }

  if (!last) throw new Error(`race for ${strategy.id} produced no ticks`);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    scores: last.scores,
    narratives: last.narratives,
    cohortState: last.cohortState,
    reachedCount: last.activatedPersonaIds.length,
    personaCount: audience.members.length,
    sampleReplies: sampleReplies(sim.finalEvents()),
  };
}
