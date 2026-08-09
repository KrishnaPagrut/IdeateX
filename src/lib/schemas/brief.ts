import { z } from "zod";

export const BriefSchema = z.object({
  ideaSummary: z.string().describe("One-paragraph neutral restatement of the idea"),
  category: z.enum(["product", "policy", "pricing", "campaign", "other"]),
  targetMarket: z.string(),
  keyAssumptions: z
    .array(z.string())
    .max(5)
    .describe("Assumptions the idea's success depends on"),
  riskDimensions: z
    .array(z.string())
    .max(5)
    .describe("Dimensions along which the idea could fail"),
  segments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        whyRelevant: z.string(),
      }),
    )
    .min(2)
    .max(8)
    .describe("Population segments to study; one planner is assigned per segment"),
  clarityScore: z.number().min(0).max(100).describe("How well-specified the idea is"),
  ambiguities: z.array(z.string()).max(4),
});

export type Brief = z.infer<typeof BriefSchema>;
