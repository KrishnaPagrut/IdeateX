import { z } from "zod";

export const SYNTHESIS_VERDICTS = [
  "strong_signal",
  "promising",
  "mixed",
  "weak",
  "dead_on_arrival",
] as const;

export const SynthesisSchema = z.object({
  verdict: z.enum(SYNTHESIS_VERDICTS),
  confidence: z.number().min(0).max(100),
  oneLiner: z.string().max(140).describe("The verdict in one punchy sentence"),
  scores: z.object({
    desirability: z.number().min(0).max(100),
    viability: z.number().min(0).max(100),
    urgency: z.number().min(0).max(100),
  }),
  keyFindings: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        supportingSegments: z.array(z.string()),
      }),
    )
    .max(5),
  topRisks: z
    .array(
      z.object({
        risk: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        mitigation: z.string(),
      }),
    )
    .max(4),
  segmentSummaries: z.array(
    z.object({
      segment: z.string(),
      meanAdoption: z.number().min(0).max(100),
      stance: z.string().describe("One-phrase characterization of this segment's reaction"),
      notableQuote: z.string(),
    }),
  ),
  boldestBet: z.string().describe("The single highest-leverage change that would most improve the idea"),
  nextSteps: z.array(z.string()).max(4),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;
