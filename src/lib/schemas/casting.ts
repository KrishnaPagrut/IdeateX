import { z } from "zod";

export const CastingPlanSchema = z.object({
  segment: z.string(),
  rationale: z.string().describe("Why this sample represents the segment"),
  picks: z
    .array(
      z.object({
        personaId: z.string().describe("Must be an id from the provided persona index"),
        angle: z
          .string()
          .describe("The specific lens this persona should evaluate the idea through"),
        probeQuestions: z.array(z.string()).max(3),
      }),
    )
    .min(1)
    .max(15),
});

export type CastingPlan = z.infer<typeof CastingPlanSchema>;

// ---------------------------------------------------------------------------
// Casting spec (v2): at library scale planners don't pick individual persona
// ids — they write a casting contract against the pool taxonomy, and the
// engine resolves it to concrete personas within the run's persona budget.
// ---------------------------------------------------------------------------

export const CastingSpecSchema = z.object({
  segment: z.string(),
  rationale: z.string().describe("Why this sample represents the segment"),
  requests: z
    .array(
      z.object({
        pool: z
          .string()
          .describe('Pool key exactly as listed in the taxonomy, e.g. "consumers/budget-households"'),
        count: z.number().min(1).max(30).describe("How many people to draw from this pool"),
        mustInclude: z
          .array(z.string())
          .max(4)
          .describe("Descriptor labels the sample should lean toward (matched against persona tags/archetypes); empty = any"),
        angle: z
          .string()
          .describe("The lens everyone drawn from this pool should evaluate the idea through"),
        probeQuestions: z.array(z.string()).max(3),
      }),
    )
    .min(1)
    .max(4),
});

export type CastingSpec = z.infer<typeof CastingSpecSchema>;
