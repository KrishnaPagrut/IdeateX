import { eq } from "drizzle-orm";

import { db, agentRuns, type Persona, type Run } from "@/lib/db";
import { discussionPrompt, type PeerTake } from "@/lib/prompts/discussion";
import { DiscussionSchema } from "@/lib/schemas/discussion";
import type { VerdictRecord } from "../aggregate";
import { createPersonaLimiter, isAbortError } from "../concurrency";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Focus-group stage (opt-in): each persona hears its segment peers' first
// reactions and responds in character. One extra swarm call per persona.
// The discussion agent_run's parent is the persona's ORIGINAL simulation run;
// the peers it heard are stored in output.heardAgentRunIds (graph edges).
// Failures here are non-fatal: the discussion enriches the study, it doesn't
// gate it.
// ---------------------------------------------------------------------------

const MAX_PEERS = 6;
const MIN_PEERS = 3;

export interface DiscussionRecord {
  agentRunId: string;
  personaId: string;
  personaName: string;
  segment: string;
  originalAdoption: number;
  updatedAdoption: number;
  changedMind: boolean;
  keyPointHeard: string;
}

function peersFor(record: VerdictRecord, all: VerdictRecord[]): VerdictRecord[] {
  const others = all.filter((r) => r.personaId !== record.personaId);
  const sameSegment = others.filter((r) => r.segment === record.segment);
  const fill = others.filter((r) => r.segment !== record.segment);
  // Same segment first; top up small groups from other segments so singleton
  // segments still get a real discussion.
  return [...sameSegment, ...(sameSegment.length < MIN_PEERS ? fill : [])].slice(0, MAX_PEERS);
}

function toPeerTake(r: VerdictRecord): PeerTake {
  return {
    name: r.personaName,
    archetype: r.archetype,
    adoptionLikelihood: r.verdict.adoptionLikelihood,
    quote: r.verdict.verbatimQuote,
    topObjection: r.verdict.topObjections[0] ?? null,
  };
}

export async function runDiscussionStage(
  ctx: AgentContext,
  run: Run,
  stimulus: string,
  records: VerdictRecord[],
  personaById: Map<string, Persona>,
): Promise<DiscussionRecord[]> {
  const limit = createPersonaLimiter();
  const results: DiscussionRecord[] = [];

  await Promise.all(
    records.map((record) =>
      limit(async () => {
        if (ctx.signal.aborted || ctx.meter.exceeded) return;
        const persona = personaById.get(record.personaId);
        const peers = peersFor(record, records);
        if (!persona || peers.length === 0) return;

        const { system, prompt } = discussionPrompt({
          persona,
          idea: stimulus,
          ownVerdict: record.verdict,
          peers: peers.map(toPeerTake),
        });

        try {
          const { agentRunId, output } = await executeAgent({
            ctx,
            kind: "discussion",
            label: `${persona.name} · reply`,
            parentAgentRunId: record.agentRunId ?? null,
            personaId: persona.id,
            segment: record.segment,
            role: "swarm",
            schema: DiscussionSchema,
            system,
            prompt,
          });

          // Interaction edges: which peer runs this persona heard.
          const heardAgentRunIds = peers
            .map((p) => p.agentRunId)
            .filter((id): id is string => Boolean(id));
          await db
            .update(agentRuns)
            .set({ output: { ...output, heardAgentRunIds } })
            .where(eq(agentRuns.id, agentRunId));

          results.push({
            agentRunId,
            personaId: persona.id,
            personaName: persona.name,
            segment: record.segment,
            originalAdoption: record.verdict.adoptionLikelihood,
            updatedAdoption: output.updatedAdoptionLikelihood,
            changedMind: output.changedMind,
            keyPointHeard: output.keyPointHeard,
          });
        } catch (error) {
          if (isAbortError(error)) throw error;
          // Non-fatal: the row is already marked failed by executeAgent.
        }
      }),
    ),
  );

  if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
  return results;
}

/** Deterministic TS summary handed to critics and synthesis. */
export function summarizeDiscussion(records: DiscussionRecord[]): string {
  if (records.length === 0) return "";
  const changed = records.filter((r) => r.changedMind);
  const meanBefore = records.reduce((a, r) => a + r.originalAdoption, 0) / records.length;
  const meanAfter = records.reduce((a, r) => a + r.updatedAdoption, 0) / records.length;
  const biggest = [...records]
    .sort(
      (a, b) =>
        Math.abs(b.updatedAdoption - b.originalAdoption) -
        Math.abs(a.updatedAdoption - a.originalAdoption),
    )
    .slice(0, 5);

  return [
    "FOCUS GROUP (personas heard segment peers' reactions and responded):",
    `- ${changed.length}/${records.length} personas changed their mind; mean adoption moved ${meanBefore.toFixed(1)} → ${meanAfter.toFixed(1)}.`,
    ...biggest.map(
      (r) =>
        `- ${r.personaName} (${r.segment}): ${r.originalAdoption} → ${r.updatedAdoption}. Key point heard: ${r.keyPointHeard}`,
    ),
    "Treat large group-induced swings as social-influence signal (fragile conviction), not extra demand.",
  ].join("\n");
}
