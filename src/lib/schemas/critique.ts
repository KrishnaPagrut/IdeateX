import { z } from "zod";

export const CritiqueSchema = z.object({
  stance: z.enum(["methodology", "redteam"]),
  findings: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]),
        claim: z.string(),
        evidence: z.string(),
      }),
    )
    .max(6),
  biasWarnings: z
    .array(z.string())
    .max(4)
    .describe("Ways the simulation itself may be skewed (sycophancy, sample bias, consensus artifacts)"),
  contraryEvidence: z
    .array(z.string())
    .max(4)
    .describe("Strongest real-world evidence against the current conclusion; cite sources when grounded"),
  adjustedConfidence: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence in the study's aggregate signal after this critique"),
});

export type Critique = z.infer<typeof CritiqueSchema>;
