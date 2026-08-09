// ---------------------------------------------------------------------------
// In-process registry of live runs. globalThis-scoped so Next.js dev-mode
// module re-evaluation reuses one map (same pattern as events.ts) — cancelRun
// from an API route hits the same registry the orchestrator registered into.
// ---------------------------------------------------------------------------

export interface LiveRun {
  controller: AbortController;
}

const globalRegistry = globalThis as unknown as {
  __ideatexRunRegistry?: Map<string, LiveRun>;
};

const registry = (globalRegistry.__ideatexRunRegistry ??= new Map<string, LiveRun>());

/** Register a run and get its AbortController. Overwrites any stale entry. */
export function registerRun(runId: string): AbortController {
  const controller = new AbortController();
  registry.set(runId, { controller });
  return controller;
}

export function getLiveRun(runId: string): LiveRun | undefined {
  return registry.get(runId);
}

export function releaseRun(runId: string): void {
  registry.delete(runId);
}

/** Abort a live run. Returns false when the run is not live in this process. */
export function abortRun(runId: string): boolean {
  const live = registry.get(runId);
  if (!live) return false;
  live.controller.abort();
  return true;
}
