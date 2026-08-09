import type { Persona } from "@/lib/db";
import type { Engagement, SimTraits } from "@/lib/schemas/marketing";
import { hashSeed, makeRng } from "./rng";

// ---------------------------------------------------------------------------
// Deterministic sim-trait derivation. Planners write pool contracts and never
// see individual personas, so an LLM can't assign per-persona traits without
// an extra fan-out — instead each cast persona's traits blend its stored
// psychographics with the cohort baseline plus seeded jitter. Same persona,
// same cohort, same run seed → identical traits, so the race replays.
// ---------------------------------------------------------------------------

/** Map a 1-5 psychographic scale onto 0-1. */
function scale01(value: number): number {
  return Math.max(0, Math.min(1, (value - 1) / 4));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const BASELINE_WEIGHT = 0.6;
const PERSONA_WEIGHT = 1 - BASELINE_WEIGHT;

export function deriveTraits(
  persona: Persona,
  baseline: SimTraits,
  runSeed: number,
): { traits: SimTraits; engagement: Engagement } {
  const rng = makeRng(hashSeed(`${persona.id}:${runSeed}`));
  const p = persona.psychographics;

  // Persona-implied dispositions from the stored 1-5 psychographics.
  const impliedSkepticism = clamp01((1 - scale01(p.openness)) * 0.6 + scale01(p.priceSensitivity) * 0.4);
  const impliedPersuadability = clamp01(scale01(p.openness) * 0.6 + scale01(p.riskTolerance) * 0.4);
  const impliedHumor = clamp01(scale01(p.openness) * 0.5 + scale01(p.riskTolerance) * 0.3 + 0.2 * rng.next());
  // Influence has no psychographic analogue — baseline-anchored with jitter,
  // plus a nudge for tech-savvy loud voices.
  const impliedInfluence = clamp01(scale01(p.techSavviness) * 0.5 + rng.next() * 0.5);

  const blend = (base: number, implied: number) =>
    rng.around(clamp01(base * BASELINE_WEIGHT + implied * PERSONA_WEIGHT), 0.12);

  const traits: SimTraits = {
    humor: blend(baseline.humor, impliedHumor),
    skepticism: blend(baseline.skepticism, impliedSkepticism),
    influence: blend(baseline.influence, impliedInfluence),
    persuadability: blend(baseline.persuadability, impliedPersuadability),
  };

  const postRate = 0.1 + rng.next() * 0.8;
  const engagement: Engagement = {
    postRate,
    replyRate: clamp01(0.15 + rng.next() * 0.6),
    repostRate: clamp01(0.1 + rng.next() * 0.5),
    // Heavy posters lurk less, and vice versa.
    lurkRate: clamp01(1 - postRate * 0.7 - rng.next() * 0.2),
  };

  return { traits, engagement };
}
