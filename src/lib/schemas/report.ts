import { z } from "zod";

// ---------------------------------------------------------------------------
// The final founder-facing marketing report: why the winner won, what to
// ship, and what to brace for. Every content draft cites the sim finding or
// advisor directive it answers — that traceability is the product.
// ---------------------------------------------------------------------------

export const MARKETING_VERDICTS = [
  "launch_ready",
  "promising",
  "needs_work",
  "high_risk",
] as const;

export const MarketingReportSchema = z.object({
  verdict: z.enum(MARKETING_VERDICTS),
  confidence: z.number().min(0).max(100),
  oneLiner: z.string().max(160).describe("The readout in one punchy sentence"),
  winnerRationale: z
    .string()
    .describe("Why this strategy won the race, in plain language, citing scores and narratives"),
  keyFindings: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        sourceRef: z
          .string()
          .describe("The score, narrative, advisor directive, or persona quote this rests on"),
      }),
    )
    .max(5),
  campaign: z.object({
    xPosts: z
      .array(
        z.object({
          body: z.string().max(280),
          answersFinding: z.string().describe("Which finding/directive this post answers"),
        }),
      )
      .min(2)
      .max(3),
    redditPost: z.object({
      title: z.string().max(300),
      body: z.string(),
      subredditStyle: z
        .string()
        .describe('Community register to write for, e.g. "r/productivity — no self-promo tone"'),
      answersFinding: z.string(),
    }),
    adVariants: z
      .array(
        z.object({
          headline: z.string().max(90),
          body: z.string().max(300),
          answersFinding: z.string(),
        }),
      )
      .min(2)
      .max(2),
  }),
  objectionLedger: z
    .array(
      z.object({
        objection: z.string(),
        source: z
          .string()
          .describe('Where it surfaced, e.g. "narrative: Pricing is unclear" or "swarm verdicts"'),
        rebuttal: z.string().describe("The honest one-paragraph answer the brand should give"),
      }),
    )
    .max(6),
  preMortem: z.object({
    scenario: z.string().describe("The most plausible way this campaign goes badly viral"),
    thread: z
      .array(
        z.object({
          handle: z.string().describe("Invented handle, e.g. @skeptic_dev"),
          post: z.string().max(280),
        }),
      )
      .min(3)
      .max(6),
    responsePlan: z.string(),
  }),
  nextSteps: z.array(z.string()).max(4),
});

export type MarketingReport = z.infer<typeof MarketingReportSchema>;
