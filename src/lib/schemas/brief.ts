import { z } from "zod";

import { PlatformSchema, SimTraitsSchema } from "./marketing";

// ---------------------------------------------------------------------------
// Marketing brief (current pipeline): the framing agent designs the study —
// audience cohorts with sim-trait baselines replace the old flat segments.
// ---------------------------------------------------------------------------

export const AudienceCohortDefSchema = z.object({
  name: z.string().max(60),
  description: z.string(),
  whyRelevant: z.string(),
  populationShare: z
    .number()
    .min(0)
    .max(1)
    .describe("Rough share of the target audience; shares should sum to ~1"),
  coreInterests: z.array(z.string()).min(1).max(6),
  coreValues: z.array(z.string()).min(1).max(4),
  commonObjections: z.array(z.string()).min(1).max(4),
  purchasingTriggers: z.array(z.string()).min(1).max(4),
  mediaDiet: z.array(PlatformSchema).min(1).max(4),
  baseline: SimTraitsSchema.describe(
    "Cohort-typical dispositions (0-1); individual personas vary around these",
  ),
});
export type AudienceCohortDef = z.infer<typeof AudienceCohortDefSchema>;

export const MarketingBriefSchema = z.object({
  productSummary: z.string().describe("One-paragraph neutral restatement of the product"),
  objectiveSummary: z
    .string()
    .describe("What the user wants out of this campaign, restated crisply"),
  keyAssumptions: z
    .array(z.string())
    .max(5)
    .describe("Assumptions the campaign's success depends on"),
  riskDimensions: z
    .array(z.string())
    .max(5)
    .describe("Dimensions along which the campaign could fail"),
  cohorts: z
    .array(AudienceCohortDefSchema)
    .min(2)
    .max(8)
    .describe("Audience cohorts to cast and simulate; one planner is assigned per cohort"),
  clarityScore: z.number().min(0).max(100).describe("How well-specified the inputs are"),
  ambiguities: z.array(z.string()).max(4),
});
export type MarketingBrief = z.infer<typeof MarketingBriefSchema>;

// Legacy brief (pre-marketing pipeline) — removed once framing/planning stop
// consuming it in the stage rewrites.
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
