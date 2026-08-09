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
