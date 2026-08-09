import { eq } from "drizzle-orm";

import { db, personas, type Persona, type Run } from "@/lib/db";
import { isMock } from "@/lib/llm/client";
import { TIER_SHAPE } from "@/lib/llm/cost";
import {
  formatPersonaIndex,
  plannerInvalidIdsRetrySuffix,
  plannerPrompt,
} from "@/lib/prompts/planner";
import type { Brief } from "@/lib/schemas/brief";
import { CastingPlanSchema } from "@/lib/schemas/casting";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Planning: one casting planner per segment, all in parallel. Picks are
// validated against real persona ids (one re-ask, then random fallback);
// mock-mode picks are re-cast onto real ids since the mock adapter cannot
// know DB uuids. Picks are deduped across planners (first planner wins).
// ---------------------------------------------------------------------------

export interface CastingPick {
  personaId: string;
  segment: string;
  angle: string;
  probeQuestions: string[];
  plannerAgentId: string;
}

export interface PlanningResult {
  picks: CastingPick[];
  personaById: Map<string, Persona>;
}

const FALLBACK_ANGLE =
  "React as a typical member of this segment encountering the idea for the first time.";

function sample<T>(pool: T[], n: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export async function runPlanningStage(
  ctx: AgentContext,
  run: Run,
  brief: Brief,
  framingAgentId: string,
): Promise<PlanningResult> {
  const shape = TIER_SHAPE[run.tier];

  const library = await db.select().from(personas).where(eq(personas.active, true));
  if (library.length === 0) {
    throw new Error("no_active_personas: seed the persona library before starting a run");
  }
  const personaById = new Map(library.map((p) => [p.id, p]));
  const validIds = new Set(personaById.keys());
  const personaIndex = formatPersonaIndex(library);
  const budget = Math.min(shape.personasPerPlanner, library.length);

  const plannerJobs = Array.from({ length: shape.planners }, (_, i) => {
    // The framing prompt pins segment count to planner count, but tolerate a
    // shorter list (e.g. schema-min mock briefs) by cycling segments.
    const segment = brief.segments[i % brief.segments.length];
    return { index: i, segment };
  });

  const perPlanner = await Promise.all(
    plannerJobs.map(async ({ index, segment }) => {
      const { system, prompt } = plannerPrompt({ brief, segment, personaIndex, budget });

      const { agentRunId, output } = await executeAgent({
        ctx,
        kind: "planner",
        label: `Planner ${index + 1} · ${segment.name}`,
        parentAgentRunId: framingAgentId,
        segment: segment.name,
        role: "reasoner",
        schema: CastingPlanSchema,
        system,
        prompt,
        effort: "medium",
        // One re-ask when the plan references ids not in the library (real
        // mode only — mock picks are always fake and get re-cast below).
        reask: isMock()
          ? undefined
          : (plan) => {
              const invalid = plan.picks
                .map((p) => p.personaId)
                .filter((id) => !validIds.has(id));
              return invalid.length > 0 ? plannerInvalidIdsRetrySuffix(invalid) : null;
            },
      });

      let picks: CastingPick[];
      if (isMock()) {
        // Mock casting contract: replace fake uuids with a real random sample
        // of active persona ids, keeping the mock angles/probes where present.
        picks = sample(library, budget).map((p, i) => {
          const mockPick = output.picks[i % output.picks.length];
          return {
            personaId: p.id,
            segment: segment.name,
            angle: mockPick?.angle ?? FALLBACK_ANGLE,
            probeQuestions: mockPick?.probeQuestions ?? [],
            plannerAgentId: agentRunId,
          };
        });
      } else {
        const seen = new Set<string>();
        picks = output.picks
          .filter((p) => validIds.has(p.personaId) && !seen.has(p.personaId) && seen.add(p.personaId))
          .map((p) => ({
            personaId: p.personaId,
            segment: segment.name,
            angle: p.angle,
            probeQuestions: p.probeQuestions,
            plannerAgentId: agentRunId,
          }));
        if (picks.length === 0) {
          // Re-ask also failed to produce valid ids → random fallback sample.
          picks = sample(library, budget).map((p) => ({
            personaId: p.id,
            segment: segment.name,
            angle: FALLBACK_ANGLE,
            probeQuestions: [],
            plannerAgentId: agentRunId,
          }));
        }
      }
      return picks;
    }),
  );

  // Dedupe across planners: the first planner to pick a persona keeps it.
  const deduped = new Map<string, CastingPick>();
  for (const pick of perPlanner.flat()) {
    if (!deduped.has(pick.personaId)) deduped.set(pick.personaId, pick);
  }

  return { picks: [...deduped.values()], personaById };
}
