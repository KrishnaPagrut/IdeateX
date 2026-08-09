import type { Aggregates } from "@/lib/engine/aggregate";
import type { AgentLite, RunAggregates } from "./types";

// ---------------------------------------------------------------------------
// The engine stores its richer Aggregates shape in runs.aggregates; the
// results components consume the flatter RunAggregates wire shape (which the
// hand-authored fixture also uses). This adapter accepts either and returns
// the wire shape.
// ---------------------------------------------------------------------------

export function toRunAggregates(
  raw: unknown,
  agents: Pick<AgentLite, "kind" | "status">[],
): RunAggregates | null {
  if (raw === null || typeof raw !== "object") return null;
  const probe = raw as Record<string, unknown>;
  if (Array.isArray(probe.adoptionHistogram)) return raw as RunAggregates;
  if (typeof probe.adoption !== "object" || probe.adoption === null) return null;
  const value = raw as Aggregates;

  const personaAgents = agents.filter((a) => a.kind === "persona");
  const completed = personaAgents.filter((a) => a.status === "completed").length;
  const failed = personaAgents.filter((a) => a.status === "failed").length;

  // Dominant cadence stands in for "mean willingness to pay" in the summary.
  const cadences = Object.entries(value.wtp.byCadence);
  cadences.sort((a, b) => b[1].count - a[1].count);
  const dominant = cadences[0];

  return {
    personaCount: value.sampleSize,
    completed: completed || value.sampleSize,
    failed,
    meanAdoption: value.adoption.mean,
    medianAdoption: value.adoption.median,
    adoptionHistogram: value.adoption.histogram.map((count, i) => ({
      min: i * 10,
      max: i === 9 ? 100 : (i + 1) * 10,
      count,
    })),
    emotionalBreakdown: value.emotionalReactions,
    recommendRate: value.recommendRate,
    meanWillingnessToPay: dominant
      ? { amount: dominant[1].mean, currency: dominant[1].currency, cadence: dominant[0] }
      : null,
    objectionFrequency: value.objections.map((o) => ({ objection: o.label, count: o.count })),
    segmentStats: Object.entries(value.adoption.bySegment).map(([segment, stats]) => ({
      segment,
      n: stats.count,
      meanAdoption: stats.mean,
    })),
  };
}
