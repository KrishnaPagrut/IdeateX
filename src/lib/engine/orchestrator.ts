import { and, eq, inArray, lt } from "drizzle-orm";

import { db, runs, type RunStatus } from "@/lib/db";
import { CostMeter, TIER_SHAPE } from "@/lib/llm/cost";
import { computeAggregates } from "./aggregate";
import type { AgentContext } from "./agent";
import { isAbortError } from "./concurrency";
import { emitRunEvent, initRunSequence } from "./events";
import { abortRun, registerRun, releaseRun } from "./registry";
import { runCritiqueStage } from "./stages/critique";
import { runFramingStage } from "./stages/framing";
import { runSimulationStage } from "./stages/personas";
import { runPlanningStage } from "./stages/planning";
import { runSynthesisStage } from "./stages/synthesis";

// ---------------------------------------------------------------------------
// The multi-agent validation pipeline:
//   pending → framing → planning → simulating → critiquing → synthesizing
//   → completed | failed | cancelled
// Statuses are persisted AND emitted at every transition; each stage brackets
// itself with stage:started / stage:completed events.
// ---------------------------------------------------------------------------

// --- Boot-time stale marking -----------------------------------------------
// Runs left non-terminal by a previous process can never finish (the swarm
// lives in-process), so mark them stale once per process. Scoped to rows
// created before boot so freshly-inserted pending runs are never clobbered.

const NON_TERMINAL: RunStatus[] = [
  "pending",
  "framing",
  "planning",
  "simulating",
  "critiquing",
  "synthesizing",
];

const globalBoot = globalThis as unknown as { __ideatexStaleMarked?: boolean };
if (!globalBoot.__ideatexStaleMarked) {
  globalBoot.__ideatexStaleMarked = true;
  const bootTime = new Date();
  void db
    .update(runs)
    .set({ status: "stale" })
    .where(and(inArray(runs.status, NON_TERMINAL), lt(runs.createdAt, bootTime)))
    .catch((error: unknown) => {
      console.error("[orchestrator] stale-run marking failed:", error);
    });
}

// --- Public API -------------------------------------------------------------

/** Fire-and-forget: drives the run to a terminal status. Never throws synchronously. */
export function startRun(runId: string): void {
  try {
    const controller = registerRun(runId);
    const meter = new CostMeter();
    void pipeline(runId, controller.signal, meter)
      .catch(async (error: unknown) => {
        await finalizeAbnormally(runId, controller.signal, meter, error);
      })
      .catch((error: unknown) => {
        // Even the failure handler failed (e.g. DB down) — never unhandled-reject.
        console.error(`[orchestrator] run ${runId} finalization failed:`, error);
      })
      .finally(() => releaseRun(runId));
  } catch (error) {
    console.error(`[orchestrator] startRun(${runId}) failed to launch:`, error);
  }
}

/** Abort a live run in this process. Returns true when the run was live here. */
export function cancelRun(runId: string): boolean {
  return abortRun(runId);
}

// --- Pipeline ---------------------------------------------------------------

async function setStatus(
  runId: string,
  status: RunStatus,
  extra: Partial<typeof runs.$inferInsert> = {},
): Promise<void> {
  await db.update(runs).set({ status, ...extra }).where(eq(runs.id, runId));
  await emitRunEvent(runId, "run:status", { status });
}

function checkpoint(ctx: AgentContext): void {
  if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (ctx.meter.exceeded) throw new Error("cost_cap");
}

async function pipeline(runId: string, signal: AbortSignal, meter: CostMeter): Promise<void> {
  initRunSequence(runId);

  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) throw new Error(`run ${runId} not found`);

  const ctx: AgentContext = { runId, signal, meter };
  const shape = TIER_SHAPE[run.tier];

  // -- framing
  await setStatus(runId, "framing", { startedAt: new Date() });
  await emitRunEvent(runId, "stage:started", { stage: "framing", agentCount: 1 });
  const { brief, framingAgentId } = await runFramingStage(ctx, run);
  await emitRunEvent(runId, "stage:completed", { stage: "framing" });
  checkpoint(ctx);

  // -- planning
  await setStatus(runId, "planning");
  await emitRunEvent(runId, "stage:started", { stage: "planning", agentCount: shape.planners });
  const { picks, personaById } = await runPlanningStage(ctx, run, brief, framingAgentId);
  await emitRunEvent(runId, "stage:completed", { stage: "planning" });
  checkpoint(ctx);

  // -- simulating
  await setStatus(runId, "simulating");
  await emitRunEvent(runId, "stage:started", { stage: "simulating", agentCount: picks.length });
  const records = await runSimulationStage(ctx, run, picks, personaById);
  const aggregates = computeAggregates(records);
  await db
    .update(runs)
    .set({ aggregates: aggregates as unknown as Record<string, unknown> })
    .where(eq(runs.id, runId));
  await emitRunEvent(runId, "stage:completed", { stage: "simulating" });
  checkpoint(ctx);

  // -- critiquing
  await setStatus(runId, "critiquing");
  await emitRunEvent(runId, "stage:started", { stage: "critiquing", agentCount: 2 });
  const critiques = await runCritiqueStage(ctx, run, brief, aggregates, records, framingAgentId);
  await emitRunEvent(runId, "stage:completed", { stage: "critiquing" });
  checkpoint(ctx);

  // -- synthesizing
  await setStatus(runId, "synthesizing");
  await emitRunEvent(runId, "stage:started", { stage: "synthesizing", agentCount: 1 });
  await runSynthesisStage(ctx, run, brief, aggregates, critiques, records, framingAgentId);
  await emitRunEvent(runId, "stage:completed", { stage: "synthesizing" });

  // -- done
  await db
    .update(runs)
    .set({
      status: "completed",
      finishedAt: new Date(),
      actualCostUsd: meter.total.toFixed(4),
    })
    .where(eq(runs.id, runId));
  await emitRunEvent(runId, "cost:update", { totalUsd: meter.total });
  await emitRunEvent(runId, "run:status", { status: "completed" });
}

async function finalizeAbnormally(
  runId: string,
  signal: AbortSignal,
  meter: CostMeter,
  error: unknown,
): Promise<void> {
  const cancelled = signal.aborted || isAbortError(error);
  const message = error instanceof Error ? error.message : String(error);
  const common = { finishedAt: new Date(), actualCostUsd: meter.total.toFixed(4) };
  if (cancelled) {
    await db
      .update(runs)
      .set({ status: "cancelled", ...common })
      .where(eq(runs.id, runId));
    await emitRunEvent(runId, "run:status", { status: "cancelled" });
  } else {
    await db
      .update(runs)
      .set({ status: "failed", error: message, ...common })
      .where(eq(runs.id, runId));
    await emitRunEvent(runId, "run:status", { status: "failed", error: message });
  }
}
