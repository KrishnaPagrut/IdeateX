/**
 * Monte Carlo schedule simulation.
 *
 * A single "expected slip" number is a lie of precision — it implies the plan
 * lands on one date. Real schedules are distributions. This runs the whole
 * dependency graph thousands of times, sampling each task's actual duration
 * from its risk profile, and reports where the finishes actually cluster.
 *
 * That turns "we estimated 34 days" into "P50 is 41 days, P80 is 52, and you
 * have a 23% chance of hitting the date you promised" — which is the sentence
 * an engineering leader actually needs.
 *
 * Seeded, so a given plan replays identically.
 */
import { makeRng, type Rng } from "../ai/rng";
import type { EngTask } from "../schemas";

export type ScheduleSimulation = {
  runs: number;
  /** Completion day for each run, sorted ascending. */
  p10: number;
  p50: number;
  p80: number;
  p95: number;
  mean: number;
  /** Deterministic critical path, for reference against the distribution. */
  deterministic: number;
  /** Histogram for plotting: bucket start day → count. */
  histogram: Array<{ day: number; count: number }>;
  /**
   * How often each task landed on the run's critical path. A task that is
   * critical in 90% of runs is a real risk; one that is critical in 5% is not.
   */
  criticality: Array<{ taskId: string; share: number }>;
  /** Probability of finishing on or before a target, if one was supplied. */
  targetDays?: number;
  targetProbability?: number;
};

/**
 * Sample an actual duration for a task.
 *
 * Uses a right-skewed draw: tasks finish a little early at best, but overrun
 * badly at worst — which is how software actually behaves. `risk` widens the
 * tail rather than simply shifting the mean.
 */
function sampleDuration(task: EngTask, rng: Rng): number {
  const optimistic = task.estimateDays * 0.85;
  const likely = task.estimateDays;
  // A high-risk task can blow out to ~3x; a low-risk one barely moves.
  const pessimistic = task.estimateDays * (1 + task.risk * 2.2);

  // Triangular distribution — cheap, well-behaved, and honest about skew.
  const u = rng.next();
  const c = (likely - optimistic) / (pessimistic - optimistic || 1);
  const d =
    u < c
      ? optimistic + Math.sqrt(u * (pessimistic - optimistic) * (likely - optimistic))
      : pessimistic - Math.sqrt((1 - u) * (pessimistic - optimistic) * (pessimistic - likely));

  return Math.max(0.25, d);
}

/** Longest path through the graph for one sampled set of durations. */
function runOnce(
  tasks: EngTask[],
  byId: Map<string, EngTask>,
  durations: Map<string, number>,
): { finish: number; critical: Set<string> } {
  const finishAt = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    const done = finishAt.get(id);
    if (done !== undefined) return done;
    if (visiting.has(id)) return 0; // cycle guard

    const task = byId.get(id);
    if (!task) return 0;

    visiting.add(id);
    let start = 0;
    let from: string | null = null;
    for (const dep of task.dependsOn) {
      const end = resolve(dep);
      if (end > start) {
        start = end;
        from = dep;
      }
    }
    visiting.delete(id);

    const end = start + (durations.get(id) ?? task.estimateDays);
    finishAt.set(id, end);
    predecessor.set(id, from);
    return end;
  };

  tasks.forEach((t) => resolve(t.id));

  // Walk back from the latest-finishing task to recover this run's path.
  let last: string | null = null;
  let finish = 0;
  finishAt.forEach((end, id) => {
    if (end > finish) {
      finish = end;
      last = id;
    }
  });

  const critical = new Set<string>();
  let cursor: string | null = last;
  while (cursor) {
    critical.add(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  return { finish, critical };
}

export function simulateSchedule(
  tasks: EngTask[],
  opts: { runs?: number; seed?: number; targetDays?: number } = {},
): ScheduleSimulation {
  const runs = opts.runs ?? 4000;
  const rng = makeRng(opts.seed ?? 1);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const finishes: number[] = [];
  const criticalCounts = new Map<string, number>();

  for (let i = 0; i < runs; i++) {
    const durations = new Map<string, number>();
    tasks.forEach((t) => durations.set(t.id, sampleDuration(t, rng)));
    const { finish, critical } = runOnce(tasks, byId, durations);
    finishes.push(finish);
    critical.forEach((id) => criticalCounts.set(id, (criticalCounts.get(id) ?? 0) + 1));
  }

  finishes.sort((a, b) => a - b);
  const at = (q: number) => finishes[Math.min(finishes.length - 1, Math.floor(q * finishes.length))];

  // Deterministic baseline: every task takes exactly its estimate.
  const flat = new Map(tasks.map((t) => [t.id, t.estimateDays]));
  const deterministic = runOnce(tasks, byId, flat).finish;

  // Histogram over ~24 buckets spanning the observed range.
  const min = Math.floor(finishes[0]);
  const max = Math.ceil(finishes[finishes.length - 1]);
  const buckets = 24;
  const width = Math.max(1, (max - min) / buckets);
  const counts = new Array(buckets).fill(0);
  finishes.forEach((f) => {
    const idx = Math.min(buckets - 1, Math.floor((f - min) / width));
    counts[idx]++;
  });

  const criticality = [...criticalCounts.entries()]
    .map(([taskId, n]) => ({ taskId, share: Number((n / runs).toFixed(3)) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  const targetProbability =
    opts.targetDays !== undefined
      ? Number((finishes.filter((f) => f <= opts.targetDays!).length / runs).toFixed(3))
      : undefined;

  return {
    runs,
    p10: Number(at(0.1).toFixed(1)),
    p50: Number(at(0.5).toFixed(1)),
    p80: Number(at(0.8).toFixed(1)),
    p95: Number(at(0.95).toFixed(1)),
    mean: Number((finishes.reduce((s, f) => s + f, 0) / runs).toFixed(1)),
    deterministic: Number(deterministic.toFixed(1)),
    histogram: counts.map((count, i) => ({ day: Number((min + i * width).toFixed(1)), count })),
    criticality,
    targetDays: opts.targetDays,
    targetProbability,
  };
}
