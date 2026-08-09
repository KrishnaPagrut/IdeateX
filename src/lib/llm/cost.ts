import { MODELS, type ModelRole } from "./models";
import type { RunTier } from "@/lib/db/schema";

export function costForTokens(role: ModelRole, inputTokens: number, outputTokens: number): number {
  const m = MODELS[role];
  return (inputTokens / 1_000_000) * m.inputPerM + (outputTokens / 1_000_000) * m.outputPerM;
}

export const TIER_SHAPE: Record<
  RunTier,
  { planners: number; personasPerPlanner: number; personaTotal: number }
> = {
  quick: { planners: 2, personasPerPlanner: 5, personaTotal: 10 },
  standard: { planners: 4, personasPerPlanner: 6, personaTotal: 24 },
  deep: { planners: 8, personasPerPlanner: 13, personaTotal: 104 },
};

// Rough per-call token assumptions, tuned after first real runs.
const EST = {
  framing: { in: 2_000, out: 1_500 },
  planner: { in: 8_000, out: 2_000 }, // includes persona library index
  persona: { in: 2_500, out: 800 },
  critique: { in: 12_000, out: 3_000 },
  synthesis: { in: 15_000, out: 3_000 },
};

/** Pre-launch estimate shown on the new-run form. Grounding adds tool-call fees (~$5/1k calls). */
export function estimateRunCost(tier: RunTier, grounding: boolean): number {
  const shape = TIER_SHAPE[tier];
  let usd = 0;
  usd += costForTokens("reasoner", EST.framing.in, EST.framing.out);
  usd += shape.planners * costForTokens("reasoner", EST.planner.in, EST.planner.out);
  usd += shape.personaTotal * costForTokens("swarm", EST.persona.in, EST.persona.out);
  usd += 2 * costForTokens("reasoner", EST.critique.in, EST.critique.out);
  usd += costForTokens("reasoner", EST.synthesis.in, EST.synthesis.out);
  if (grounding) usd += 0.1; // ~20 server-side search calls at $5/1k
  return usd;
}

export function maxRunUsd(): number {
  const raw = Number(process.env.IDEATEX_MAX_RUN_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/** Accumulates actual spend across a run; checked against the hard cap between fan-outs. */
export class CostMeter {
  private totalUsd = 0;
  constructor(private readonly capUsd: number = maxRunUsd()) {}

  add(role: ModelRole, inputTokens: number, outputTokens: number): number {
    const usd = costForTokens(role, inputTokens, outputTokens);
    this.totalUsd += usd;
    return usd;
  }

  get total(): number {
    return this.totalUsd;
  }

  get exceeded(): boolean {
    return this.totalUsd >= this.capUsd;
  }
}
