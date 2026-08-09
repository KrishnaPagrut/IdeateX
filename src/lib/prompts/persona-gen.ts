import { z } from "zod";

import { renderCastingSheet, type CastingSheet } from "@/lib/personas/casting-sheet";

/**
 * Prompts for generating batches of synthetic personas (the persona library),
 * plus a focused prompt for regenerating a single persona's backstory.
 *
 * Generation is pool-by-pool: each batch targets one subdomain of the pool
 * taxonomy (src/lib/personas/taxonomy.ts) under a per-batch casting sheet
 * (src/lib/personas/casting-sheet.ts) that injects controlled randomness —
 * gender quotas, age curves, income spreads, wildcards. Consumed by
 * scripts/seed-personas.ts and the /api/personas generate + regenerate routes
 * via `generate({role: "generator", ..., temperature})`.
 */

/**
 * The label vocabulary casting planners match against (`mustInclude` labels vs
 * persona tags). Organized by axis; all lowercase-kebab-case. Rendered into
 * the system prompt — keep axes and casing in sync with docs/contracts.md.
 */
export const LABEL_VOCABULARY: Record<string, string[]> = {
  attitude: [
    "skeptical", "enthusiast", "brand-loyal", "brand-agnostic", "burned-before",
    "contrarian", "trend-chaser", "privacy-conscious", "community-trusting",
  ],
  "price posture": [
    "price-sensitive", "deal-hunter", "value-maximizer", "premium-willing",
    "subscription-averse", "cash-first", "splurge-selective", "haggler",
  ],
  "decision style": [
    "research-heavy", "impulse-buyer", "review-reader", "word-of-mouth-driven",
    "spec-comparer", "gut-decider", "slow-to-commit", "committee-decider", "single-brand-defaulter",
  ],
  "life stage": [
    "student", "recent-grad", "new-parent", "mid-career", "career-changer",
    "empty-nester", "retiree", "caregiver", "newlywed", "newly-single", "first-time-homeowner",
  ],
  "tech posture": [
    "early-adopter", "late-adopter", "mobile-first", "desktop-loyalist",
    "self-taught-power-user", "tech-avoidant", "automation-curious", "privacy-hardened",
  ],
  context: [
    "urban", "suburban", "small-town", "rural", "remote-worker", "shift-worker",
    "night-shift", "long-commuter", "frequent-mover", "multigenerational-home",
    "roommate-household", "non-driver",
  ],
  values: [
    "sustainability-minded", "community-first", "status-conscious", "frugality-proud",
    "craftsmanship-valuing", "convenience-first", "health-prioritizing", "family-first",
    "independence-valuing",
  ],
};

function renderLabelVocabulary(): string {
  return Object.entries(LABEL_VOCABULARY)
    .map(([axis, labels]) => `  - ${axis}: ${labels.join(", ")}`)
    .join("\n");
}

export const PERSONA_GEN_SYSTEM = `You are a demographer and character writer building a synthetic population for market research. The population is organized into POOLS — subdomains like "budget households" or "skilled trades" — of ~25 people each. You produce believable, specific, statistically grounded personas — never caricatures, never marketing archetype clichés.

Rules:
- Every persona must BELONG believably to the assigned pool: their life, occupation, and buying behavior should make a researcher nod when told which pool they came from. But the pool must span real internal diversity — vary ages (16-90 where plausible for the pool), genders, household incomes, education levels, and locations. About 25% of personas should live outside the United States (spread across continents, not just Western Europe).
- Each batch comes with a CASTING SHEET: hard requirements on gender split, age curve, income spread, household structures, geography, and wildcard lives. Satisfy the sheet as exactly as the batch size allows — it exists precisely so batches don't converge on the same defaults.
- Occupations vary within what the pool allows; use the seed hints as starting points, not a checklist. Adjacent and unexpected-but-plausible lives are welcome — reach across society's tangents, not just the obvious center of the pool.
- Psychographic scores (1-5) must genuinely VARY across the batch. Every pool contains skeptics AND enthusiasts: include curmudgeons, late adopters, and burned-before cynics alongside the eager ones. Scores correlate plausibly with the person's life, not with what makes them a pleasant survey respondent.
- Backstories are one grounded paragraph: concrete daily life, real frustrations, what media they actually consume, and how they make buying decisions (impulsive vs. deliberate, who they consult, what kills a purchase for them). Specific detail over generalities.
- Avoid stereotypes-as-caricature: demographics inform but never dictate personality. A retiree can be an early adopter; a software engineer can be a technophobe at home.

ANTI-CLONE RULES (each is a hard constraint within a batch):
- No two personas may share an occupation, or a trivially renamed variant of one ("barista" vs "coffee shop worker" is a clone).
- No two personas may have meaningfully similar psychographic score-vectors: across (techSavviness, riskTolerance, priceSensitivity, openness), any two personas must differ by at least 2 points in total and must not have the identical high/low shape.
- Names must reflect the pool's real-world demographic diversity — not one culture's naming defaults. For global pools, names must be locally plausible for each persona's stated location. Never repeat a name within the batch or reuse anything on the exclusion list (including obvious variants).

TAGS ARE CASTING LABELS — planners select people inside a pool by matching labels, so they carry real weight:
- Emit 4-6 lowercase-kebab-case labels per persona, drawn from AT LEAST THREE different axes of this vocabulary:
${renderLabelVocabulary()}
- You may invent a new label when none of the vocabulary fits a real trait — keep it lowercase-kebab-case, generalizable (another persona could plausibly carry it), and never a proper noun.
- Pick labels that DIFFERENTIATE this persona from pool-mates — if everyone in the pool would carry the label, it is useless for casting. Do not tag the pool's own name.`;

/** The subdomain a generation batch targets, straight from the taxonomy. */
export interface PoolTarget {
  domainKey: string;
  subdomainKey: string;
  name: string;
  description: string;
  seedHints: string;
}

export interface PersonaBatchPromptArgs {
  /** How many personas to generate in this batch (max 20). */
  count: number;
  /** The pool every persona in this batch belongs to. */
  pool: PoolTarget;
  /** This batch's randomized constraint sheet — rendered as hard requirements. */
  sheet: CastingSheet;
  /** Names already used across the library — must not be reused. */
  usedNames: string[];
  /** Occupations already used — avoid exact repeats to keep the library diverse. */
  usedOccupations: string[];
  /** Tags already present in this pool — reuse where apt, but add new ones too. */
  poolTags?: string[];
}

export function buildPersonaBatchPrompt(args: PersonaBatchPromptArgs): string {
  const { count, pool, sheet, usedNames, usedOccupations, poolTags = [] } = args;

  const nameExclusion =
    usedNames.length > 0
      ? `Names already taken (do NOT reuse any of these, or obvious variants):\n${usedNames.join(", ")}`
      : "No names are taken yet.";

  const occupationExclusion =
    usedOccupations.length > 0
      ? `Occupations already represented (avoid exact repeats; adjacent roles are fine):\n${usedOccupations.join(", ")}`
      : "No occupations are represented yet.";

  const tagContext =
    poolTags.length > 0
      ? `Casting labels already in use in this pool (reuse the ones that genuinely fit so planners can match on them, and add new ones where these fall short):\n${poolTags.join(", ")}`
      : "No casting labels exist in this pool yet — establish a useful, varied set.";

  return `Generate exactly ${count} personas for one pool of the synthetic population.

# Pool: ${pool.name} (${pool.domainKey}/${pool.subdomainKey})
${pool.description}
Kinds of people this pool must span: ${pool.seedHints}.

${renderCastingSheet(sheet, count)}

${nameExclusion}

${occupationExclusion}

${tagContext}

Give each persona its own specific archetype label that fits the pool (e.g. "Coupon-clipping suburban dad", not the pool name itself). Satisfy the casting sheet above; roughly a quarter of the batch should be international (unless the pool is itself region-specific — then spread across that region's countries instead); psychographic scores must spread across the 1-5 range and obey the anti-clone rules — this pool needs its skeptics and its enthusiasts. Every backstory must be specific enough that a reader could predict how this person reacts to a new product, and every persona's 4-6 casting labels must come from at least three axes and differentiate them from their pool-mates.`;
}

/** Structured output for regenerating just a backstory (demographics stay fixed). */
export const RegeneratedBackstorySchema = z.object({
  backstory: z
    .string()
    .describe("A grounded paragraph: daily life, frustrations, media diet, decision style"),
});

export interface BackstoryPromptPersona {
  name: string;
  archetype: string;
  demographics: {
    age: number;
    gender: string;
    location: string;
    incomeBand: string;
    education: string;
    occupation: string;
  };
  psychographics: {
    techSavviness: number;
    riskTolerance: number;
    priceSensitivity: number;
    openness: number;
    values: string[];
    spendingHabits: string;
  };
}

export function buildBackstoryRegenPrompt(persona: BackstoryPromptPersona): string {
  const d = persona.demographics;
  const p = persona.psychographics;
  return `Write a fresh backstory paragraph for this existing persona. Keep every fact below fixed — the backstory must be consistent with all of it — but bring a new angle: different concrete details of daily life, different frustrations, a distinct voice.

Name: ${persona.name}
Archetype: ${persona.archetype}
Age: ${d.age} · Gender: ${d.gender} · Location: ${d.location}
Income band: ${d.incomeBand} · Education: ${d.education} · Occupation: ${d.occupation}
Tech savviness ${p.techSavviness}/5 · Risk tolerance ${p.riskTolerance}/5 · Price sensitivity ${p.priceSensitivity}/5 · Openness ${p.openness}/5
Values: ${p.values.join(", ")}
Spending habits: ${p.spendingHabits}

One grounded paragraph: concrete daily life, real frustrations, actual media diet, and how they decide what to buy. Specific over general. No caricature.`;
}
