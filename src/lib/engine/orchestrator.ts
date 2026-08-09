import { eq } from "drizzle-orm";

import { db, runs } from "@/lib/db";
import { emitRunEvent, initRunSequence } from "./events";

// ---------------------------------------------------------------------------
// STUB — workstream A replaces this file with the real pipeline.
// It walks a run through fake stage transitions so the API layer and UI can
// be built and tested end-to-end before the engine lands.
// ---------------------------------------------------------------------------

const liveRuns = new Map<string, AbortController>();

export function startRun(runId: string): void {
  const controller = new AbortController();
  liveRuns.set(runId, controller);
  fakePipeline(runId, controller.signal)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(runs).set({ status: "failed", error: message }).where(eq(runs.id, runId));
      await emitRunEvent(runId, "run:status", { status: "failed", error: message });
    })
    .finally(() => liveRuns.delete(runId));
}

export function cancelRun(runId: string): boolean {
  const controller = liveRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

const STAGES = ["framing", "planning", "simulating", "critiquing", "synthesizing"] as const;

async function fakePipeline(runId: string, signal: AbortSignal): Promise<void> {
  initRunSequence(runId);
  await db.update(runs).set({ status: "framing", startedAt: new Date() }).where(eq(runs.id, runId));

  for (const stage of STAGES) {
    if (signal.aborted) {
      await db.update(runs).set({ status: "cancelled", finishedAt: new Date() }).where(eq(runs.id, runId));
      await emitRunEvent(runId, "run:status", { status: "cancelled" });
      return;
    }
    await db.update(runs).set({ status: stage }).where(eq(runs.id, runId));
    await emitRunEvent(runId, "run:status", { status: stage });
    await emitRunEvent(runId, "stage:started", { stage, agentCount: stage === "simulating" ? 10 : 1 });
    await new Promise((r) => setTimeout(r, 1_500));
    await emitRunEvent(runId, "stage:completed", { stage });
  }

  await db
    .update(runs)
    .set({ status: "completed", finishedAt: new Date(), actualCostUsd: "0" })
    .where(eq(runs.id, runId));
  await emitRunEvent(runId, "run:status", { status: "completed" });
}
