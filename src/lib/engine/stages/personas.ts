import type { Persona, Run } from "@/lib/db";
import { personaPrompt } from "@/lib/prompts/persona";
import { VerdictSchema } from "@/lib/schemas/verdict";
import type { VerdictRecord } from "../aggregate";
import { createPersonaLimiter, isAbortError } from "../concurrency";
import { executeAgent, type AgentContext } from "../agent";
import type { CastingPick } from "./planning";

// ---------------------------------------------------------------------------
// Simulation: the persona swarm. Fans out through p-limit(20); tolerates up
// to 20% individual failures; checks the cost cap every 10 completions and
// stops queuing new work once the cap is hit or the run is aborted.
// ---------------------------------------------------------------------------

export const MAX_PERSONA_FAILURE_RATE = 0.2;
const COST_CHECK_EVERY = 10;

export async function runSimulationStage(
  ctx: AgentContext,
  run: Run,
  picks: CastingPick[],
  personaById: Map<string, Persona>,
): Promise<VerdictRecord[]> {
  const limit = createPersonaLimiter();
  const records: VerdictRecord[] = [];
  const failures: unknown[] = [];
  let completions = 0;
  let costStopped = false;

  await Promise.all(
    picks.map((pick) =>
      limit(async () => {
        // Stop queuing new calls once aborted or over budget; already-started
        // calls are cut by the shared abort signal inside generate().
        if (ctx.signal.aborted || costStopped) return;
        const persona = personaById.get(pick.personaId);
        if (!persona) {
          failures.push(new Error(`unknown persona ${pick.personaId}`));
          return;
        }

        const { system, prompt } = personaPrompt({
          persona,
          idea: run.idea,
          context: run.context,
          angle: pick.angle,
          probeQuestions: pick.probeQuestions,
        });

        try {
          const { output } = await executeAgent({
            ctx,
            kind: "persona",
            label: persona.name,
            parentAgentRunId: pick.plannerAgentId,
            personaId: persona.id,
            segment: pick.segment,
            role: "swarm",
            schema: VerdictSchema,
            system,
            prompt,
          });
          records.push({
            personaId: persona.id,
            personaName: persona.name,
            segment: pick.segment,
            archetype: persona.archetype,
            incomeBand: persona.demographics.incomeBand,
            verdict: output,
          });
        } catch (error) {
          if (isAbortError(error)) throw error;
          failures.push(error);
        } finally {
          completions += 1;
          if (completions % COST_CHECK_EVERY === 0 && ctx.meter.exceeded) {
            costStopped = true;
          }
        }
      }),
    ),
  );

  if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (costStopped || ctx.meter.exceeded) throw new Error("cost_cap");
  if (failures.length > picks.length * MAX_PERSONA_FAILURE_RATE) {
    throw new Error(
      `persona_failures: ${failures.length}/${picks.length} persona agents failed (>20%)`,
    );
  }

  return records;
}
