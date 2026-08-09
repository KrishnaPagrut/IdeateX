/**
 * Build-plan analysis.
 *
 * The model proposes tasks, estimates and dependencies. Everything derived from
 * that graph — critical path, bottlenecks, cycles, expected slip — is computed
 * here rather than asked of the model, for the same reason the CMO's findings
 * come from simulation data: a number a model invented is not evidence.
 */
import type { BuildAnalysis, EngTask } from "./types";

/**
 * Longest-path search over the dependency DAG, weighted by estimate.
 *
 * Memoised depth-first with a visiting set so a cyclic graph (which the model
 * can produce) degrades to a partial answer instead of hanging.
 */
function longestPaths(tasks: EngTask[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, { days: number; path: string[] }>();
  const visiting = new Set<string>();
  const cycles: string[][] = [];

  const walk = (id: string, trail: string[]): { days: number; path: string[] } => {
    const cached = memo.get(id);
    if (cached) return cached;

    if (visiting.has(id)) {
      // Record the cycle once, from where it closes.
      const start = trail.indexOf(id);
      if (start >= 0) cycles.push([...trail.slice(start), id]);
      return { days: 0, path: [] };
    }

    const task = byId.get(id);
    if (!task) return { days: 0, path: [] };

    visiting.add(id);
    let best = { days: 0, path: [] as string[] };
    for (const depId of task.dependsOn) {
      const sub = walk(depId, [...trail, id]);
      if (sub.days > best.days) best = sub;
    }
    visiting.delete(id);

    const result = { days: best.days + task.estimateDays, path: [...best.path, id] };
    memo.set(id, result);
    return result;
  };

  const results = tasks.map((t) => walk(t.id, []));
  return { results, cycles };
}

/** How many tasks ultimately depend on each task, transitively. */
function blockCounts(tasks: EngTask[]): Map<string, number> {
  const dependents = new Map<string, string[]>();
  tasks.forEach((t) =>
    t.dependsOn.forEach((d) => {
      const list = dependents.get(d) ?? [];
      list.push(t.id);
      dependents.set(d, list);
    }),
  );

  const counts = new Map<string, number>();
  tasks.forEach((t) => {
    const seen = new Set<string>();
    const queue = [...(dependents.get(t.id) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(dependents.get(next) ?? []));
    }
    counts.set(t.id, seen.size);
  });
  return counts;
}

export function analyseBuildPlan(tasks: EngTask[]): BuildAnalysis {
  if (!tasks.length) {
    return {
      criticalPath: [],
      criticalPathDays: 0,
      parallelFloorDays: 0,
      bottlenecks: [],
      cycles: [],
      expectedSlipDays: 0,
    };
  }

  const { results, cycles } = longestPaths(tasks);
  const longest = results.reduce((a, b) => (b.days > a.days ? b : a), results[0]);

  const counts = blockCounts(tasks);
  const bottlenecks = tasks
    .map((t) => ({ taskId: t.id, blocksCount: counts.get(t.id) ?? 0, risk: t.risk }))
    // Rank by how much work is downstream, then by how likely it is to slip.
    .sort((a, b) => b.blocksCount - a.blocksCount || b.risk - a.risk)
    .filter((b) => b.blocksCount > 0)
    .slice(0, 5);

  // Floor is the largest single task: even with infinite parallelism you can't
  // finish faster than your longest indivisible piece.
  const parallelFloorDays = Math.max(...tasks.map((t) => t.estimateDays));

  const expectedSlipDays = tasks.reduce((sum, t) => sum + t.estimateDays * t.risk, 0);

  // De-duplicate cycles that were discovered from different entry points.
  const seenCycles = new Set<string>();
  const uniqueCycles = cycles.filter((c) => {
    const key = [...c].sort().join("|");
    if (seenCycles.has(key)) return false;
    seenCycles.add(key);
    return true;
  });

  return {
    criticalPath: longest.path,
    criticalPathDays: Number(longest.days.toFixed(1)),
    parallelFloorDays: Number(parallelFloorDays.toFixed(1)),
    bottlenecks,
    cycles: uniqueCycles,
    expectedSlipDays: Number(expectedSlipDays.toFixed(1)),
  };
}
