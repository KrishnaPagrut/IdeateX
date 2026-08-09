import { z } from "zod";

// ---------------------------------------------------------------------------
// Marketing pipeline shapes: campaign strategies, the shared synthetic
// audience, and race results. Ported/adapted from src/lib/launchlab/types.ts —
// audience members are LIBRARY personas (referenced by id) enriched with
// deterministic sim traits, not invented handles.
// ---------------------------------------------------------------------------

const Trait01 = z.number().min(0).max(1);

export const PlatformSchema = z.enum([
  "x",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "reddit",
  "email",
  "web",
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const ContentFormatSchema = z.enum([
  "short_text",
  "long_thread",
  "image",
  "carousel",
  "video",
  "poll",
  "livestream",
  "article",
]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const CreativeThemeSchema = z.enum([
  "memes",
  "founder_led",
  "direct_response",
  "educational",
  "aspirational",
  "serious",
]);
export type CreativeTheme = z.infer<typeof CreativeThemeSchema>;

// --- Strategy ---------------------------------------------------------------

export const CampaignStrategySchema = z.object({
  /** Overwritten in code with a stable "strategy_<i>" id after generation. */
  id: z.string(),
  name: z.string().describe("Short strategy name, a few words"),
  theme: CreativeThemeSchema,
  positioningThesis: z.string(),
  targetCohortIds: z
    .array(z.string())
    .min(1)
    .describe("Cohort NAMES from the brief this strategy is aimed at"),
  centralMessage: z.string().describe("The one-sentence campaign message (aim under 240 chars)"),
  creativeDirection: z.string(),
  sampleLaunchPost: z.object({
    platform: PlatformSchema,
    body: z.string().describe("The post itself, platform-native (aim under 600 chars)"),
    hashtags: z.array(z.string()).max(4),
  }),
  callToAction: z.string().describe("Imperative CTA, a short phrase"),
  contentMix: z
    .array(
      z.object({
        format: ContentFormatSchema,
        platform: PlatformSchema,
        weight: Trait01,
      }),
    )
    .min(2)
    .max(6),
});
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;

// --- Audience ---------------------------------------------------------------

export const SimTraitsSchema = z.object({
  humor: Trait01,
  skepticism: Trait01,
  influence: Trait01,
  persuadability: Trait01,
});
export type SimTraits = z.infer<typeof SimTraitsSchema>;

export const EngagementSchema = z.object({
  postRate: Trait01,
  replyRate: Trait01,
  repostRate: Trait01,
  lurkRate: Trait01,
});
export type Engagement = z.infer<typeof EngagementSchema>;

export const AudienceMemberSchema = z.object({
  personaId: z.string(),
  /** Cohort name from the brief (also the casting segment name). */
  cohort: z.string(),
  traits: SimTraitsSchema,
  engagement: EngagementSchema,
});
export type AudienceMember = z.infer<typeof AudienceMemberSchema>;

export const AudienceEdgeSchema = z.object({
  /** `from` follows `to` — so `from` sees `to`'s posts. */
  from: z.string(),
  to: z.string(),
  weight: Trait01,
});
export type AudienceEdge = z.infer<typeof AudienceEdgeSchema>;

export const SyntheticAudienceSchema = z.object({
  members: z.array(AudienceMemberSchema).min(1),
  edges: z.array(AudienceEdgeSchema),
  /** Seed the graph (and each race sim) derives from — replays identically. */
  seed: z.number().int(),
});
export type SyntheticAudience = z.infer<typeof SyntheticAudienceSchema>;

// --- Race results -----------------------------------------------------------

export const StrategyScoresSchema = z.object({
  reach: z.number().min(0).max(100),
  trust: z.number().min(0).max(100),
  messageComprehension: z.number().min(0).max(100),
  purchaseIntent: z.number().min(0).max(100),
  sharePropensity: z.number().min(0).max(100),
  controversy: z.number().min(0).max(100),
  audienceFit: z.number().min(0).max(100),
  brandSafetyRisk: z.number().min(0).max(100),
});
export type StrategyScores = z.infer<typeof StrategyScoresSchema>;

export const NarrativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  sentiment: z.number().min(-1).max(1),
  carrierIds: z.array(z.string()),
  firstSeenTick: z.number().int().nonnegative(),
  momentum: z.number(),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const CohortStateSchema = z.object({
  cohortId: z.string(),
  reached: z.number(),
  population: z.number(),
  sentiment: z.number().min(-1).max(1),
  purchaseIntent: z.number().min(0).max(100),
});
export type CohortState = z.infer<typeof CohortStateSchema>;

export const RaceResultSchema = z.object({
  strategyId: z.string(),
  strategyName: z.string(),
  scores: StrategyScoresSchema,
  narratives: z.array(NarrativeSchema),
  cohortState: z.array(CohortStateSchema),
  reachedCount: z.number(),
  personaCount: z.number(),
  /** Representative replies from the sim (LLM-backed first), for advisors and the report. */
  sampleReplies: z
    .array(
      z.object({
        personaId: z.string(),
        body: z.string(),
        sentiment: z.number().min(-1).max(1),
        llmBacked: z.boolean(),
      }),
    )
    .max(12),
});
export type RaceResult = z.infer<typeof RaceResultSchema>;

// --- Advisors ---------------------------------------------------------------

export const AdvisorVerdictSchema = z.object({
  lens: z.string().describe("The advisor's expert lens, e.g. 'brand strategist'"),
  ranking: z
    .array(
      z.object({
        strategyId: z.string(),
        rank: z.number().int().min(1),
        argument: z.string(),
      }),
    )
    .min(1),
  directives: z
    .array(
      z.object({
        directive: z.string().describe("A hard constraint the campaign content must honor"),
        rationale: z.string(),
      }),
    )
    .max(4),
  concerns: z.array(z.string()).max(3),
});
export type AdvisorVerdict = z.infer<typeof AdvisorVerdictSchema>;

export const AdvisorConsensusSchema = z.object({
  winnerStrategyId: z.string(),
  rationale: z.string(),
  agreements: z.array(z.string()).max(4),
  disagreements: z.array(z.string()).max(4),
  directives: z
    .array(
      z.object({
        directive: z.string(),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(8),
});
export type AdvisorConsensus = z.infer<typeof AdvisorConsensusSchema>;
