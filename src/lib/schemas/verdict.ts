import { z } from "zod";

export const EMOTIONAL_REACTIONS = [
  "excited",
  "curious",
  "neutral",
  "skeptical",
  "annoyed",
  "angry",
] as const;

export const VerdictSchema = z.object({
  adoptionLikelihood: z
    .number()
    .min(0)
    .max(100)
    .describe("How likely this person is to actually adopt/support the idea"),
  willingnessToPay: z
    .object({
      amount: z.number().min(0),
      currency: z.string(),
      cadence: z.enum(["one_time", "monthly", "yearly", "per_use"]),
    })
    .nullable()
    .describe("null when paying is not applicable (e.g. policy ideas)"),
  emotionalReaction: z.enum(EMOTIONAL_REACTIONS),
  topObjections: z.array(z.string()).max(3),
  dealBreakers: z.array(z.string()).max(2),
  delighters: z.array(z.string()).max(2),
  verbatimQuote: z
    .string()
    .describe("First-person, in-character reaction as this persona would say it aloud"),
  wouldRecommend: z.boolean(),
  confidence: z.number().min(0).max(100),
});

export type Verdict = z.infer<typeof VerdictSchema>;
