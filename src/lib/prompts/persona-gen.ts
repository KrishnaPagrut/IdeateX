import { z } from "zod";

/**
 * Prompts for generating batches of synthetic personas (the persona library),
 * plus a focused prompt for regenerating a single persona's backstory.
 *
 * These are consumed by scripts/seed-personas.ts and the /api/personas
 * generate + regenerate routes via `generate({role: "generator", ...})`.
 */

export const PERSONA_GEN_SYSTEM = `You are a demographer and character writer building a synthetic population for market research. You produce believable, specific, statistically grounded personas — never caricatures, never marketing archetype clichés.

Rules:
- Ground the population in a realistic US-census-inspired spread of ages (16-90, weighted toward working-age adults but with real representation of teens and seniors), household incomes across all five bands, and education levels from "some high school" to doctorates. About 25% of personas should live outside the United States (spread across continents, not just Western Europe).
- Occupations must span ALL walks of life: trades, retail, agriculture, healthcare, education, logistics, government, arts, unemployed, retired, students, caregivers — not just tech and office jobs.
- Psychographic scores (1-5) must genuinely VARY across the batch. Include curmudgeons, skeptics, and late adopters — people with low openness, low tech savviness, high price sensitivity. Not everyone is curious and optimistic. Scores should correlate plausibly with the person's life, not with what makes them a pleasant survey respondent.
- Backstories are one grounded paragraph: concrete daily life, real frustrations, what media they actually consume, and how they make buying decisions (impulsive vs. deliberate, who they consult, what kills a purchase for them). Specific detail over generalities.
- Avoid stereotypes-as-caricature: demographics inform but never dictate personality. A retiree can be an early adopter; a software engineer can be a technophobe at home.
- Names must be realistic for the persona's background and location, and must not repeat within the batch or collide with the exclusion list.
- Tags are short lowercase phrases useful for filtering (e.g. "parent", "rural", "early-adopter", "fixed-income").`;

export interface PersonaBatchPromptArgs {
  /** How many personas to generate in this batch (max 20). */
  count: number;
  /** Archetype quota line, e.g. "5 budget-conscious parents, 5 skeptical retirees, ...". */
  archetypeQuota: string;
  /** Names already used across the library — must not be reused. */
  usedNames: string[];
  /** Occupations already used — avoid exact repeats to keep the library diverse. */
  usedOccupations: string[];
}

export function buildPersonaBatchPrompt(args: PersonaBatchPromptArgs): string {
  const { count, archetypeQuota, usedNames, usedOccupations } = args;

  const nameExclusion =
    usedNames.length > 0
      ? `Names already taken (do NOT reuse any of these, or obvious variants):\n${usedNames.join(", ")}`
      : "No names are taken yet.";

  const occupationExclusion =
    usedOccupations.length > 0
      ? `Occupations already represented (avoid exact repeats; adjacent roles are fine):\n${usedOccupations.join(", ")}`
      : "No occupations are represented yet.";

  return `Generate exactly ${count} personas for the synthetic population.

Archetype quota for this batch (use these as families — give each persona its own specific archetype label that fits the family, e.g. "Coupon-clipping suburban dad" under budget-conscious parent):
${archetypeQuota}

${nameExclusion}

${occupationExclusion}

Remember: vary ages, income bands, education, and locations within each archetype family; roughly a quarter of this batch should be international; psychographic scores must spread across the 1-5 range; every backstory must be specific enough that a reader could predict how this person reacts to a new product.`;
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
