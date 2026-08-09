import { z } from "zod";

/**
 * Prompts for generating batches of synthetic personas (the persona library),
 * plus a focused prompt for regenerating a single persona's backstory.
 *
 * Generation is pool-by-pool: each batch targets one subdomain of the pool
 * taxonomy (src/lib/personas/taxonomy.ts) and must span that pool's internal
 * diversity. Consumed by scripts/seed-personas.ts and the /api/personas
 * generate + regenerate routes via `generate({role: "generator", ...})`.
 */

export const PERSONA_GEN_SYSTEM = `You are a demographer and character writer building a synthetic population for market research. The population is organized into POOLS — subdomains like "budget households" or "skilled trades" — of ~25 people each. You produce believable, specific, statistically grounded personas — never caricatures, never marketing archetype clichés.

Rules:
- Every persona must BELONG believably to the assigned pool: their life, occupation, and buying behavior should make a researcher nod when told which pool they came from. But the pool must span real internal diversity — vary ages (16-90 where plausible for the pool), genders, household incomes, education levels, and locations. About 25% of personas should live outside the United States (spread across continents, not just Western Europe).
- Occupations vary within what the pool allows; use the seed hints as starting points, not a checklist. Adjacent and unexpected-but-plausible lives are welcome.
- Psychographic scores (1-5) must genuinely VARY across the batch. Every pool contains skeptics AND enthusiasts: include curmudgeons, late adopters, and burned-before cynics alongside the eager ones. Scores correlate plausibly with the person's life, not with what makes them a pleasant survey respondent.
- Backstories are one grounded paragraph: concrete daily life, real frustrations, what media they actually consume, and how they make buying decisions (impulsive vs. deliberate, who they consult, what kills a purchase for them). Specific detail over generalities.
- Avoid stereotypes-as-caricature: demographics inform but never dictate personality. A retiree can be an early adopter; a software engineer can be a technophobe at home.
- Names must be realistic for the persona's background and location, and must not repeat within the batch or collide with the exclusion list.

TAGS ARE CASTING LABELS — they are how casting planners find people inside a pool, so they carry real weight:
- Emit 3-6 descriptor tags per persona, mixing at least two of these three kinds:
  - attitude: price-sensitive, brand-loyal, privacy-conscious, early-adopter, skeptical, deal-hunter, quality-first, impulse-buyer, research-heavy, subscription-averse…
  - life stage: new-parent, empty-nester, retiree, student, caregiver, recent-grad, mid-career, single…
  - context: rural, urban, suburban, remote-worker, shift-worker, high-income, fixed-income, international, small-town…
- Always lowercase-kebab-case. Pick tags that DIFFERENTIATE this persona from pool-mates — if everyone in the pool would carry the tag, it is useless for casting. Do not tag the pool's own name.`;

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
  /** Names already used across the library — must not be reused. */
  usedNames: string[];
  /** Occupations already used — avoid exact repeats to keep the library diverse. */
  usedOccupations: string[];
  /** Tags already present in this pool — reuse where apt, but add new ones too. */
  poolTags?: string[];
}

export function buildPersonaBatchPrompt(args: PersonaBatchPromptArgs): string {
  const { count, pool, usedNames, usedOccupations, poolTags = [] } = args;

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

${nameExclusion}

${occupationExclusion}

${tagContext}

Give each persona its own specific archetype label that fits the pool (e.g. "Coupon-clipping suburban dad", not the pool name itself). Vary ages, income bands, education, and locations across the batch; roughly a quarter should be international; psychographic scores must spread across the 1-5 range — this pool needs its skeptics and its enthusiasts. Every backstory must be specific enough that a reader could predict how this person reacts to a new product, and every persona's 3-6 casting tags must differentiate them from their pool-mates.`;
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
