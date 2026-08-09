/**
 * Types for the LaunchLab algorithms.
 *
 * These were extracted from a separate schema layer when this work was merged
 * onto the IdeateX base. They're kept local and self-contained so the
 * algorithms below don't couple to `src/lib/schemas/` until each one is
 * actually wired into a run stage — at which point its types should move into
 * the shared schema layer per `docs/contracts.md`.
 */
import { z } from "zod";

const Trait = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Build planning — inputs to the Monte Carlo schedule simulation
// ---------------------------------------------------------------------------

export const EngTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  area: z.enum([
    "infra",
    "backend",
    "frontend",
    "data",
    "auth",
    "integration",
    "testing",
    "ops",
  ]),
  /** Rough size in days. Weights the critical path. */
  estimateDays: z.number().min(0.5).max(30),
  /** Ids of tasks that must land before this one can start. */
  dependsOn: z.array(z.string()),
  /** 0-1 chance this task overruns, judged from its unknowns. */
  risk: Trait,
  riskReason: z.string(),
});
export type EngTask = z.infer<typeof EngTaskSchema>;

/** Derived from the task graph in code — never asked of a model. */
export const BuildAnalysisSchema = z.object({
  criticalPath: z.array(z.string()),
  criticalPathDays: z.number(),
  parallelFloorDays: z.number(),
  bottlenecks: z.array(
    z.object({ taskId: z.string(), blocksCount: z.number(), risk: Trait }),
  ),
  cycles: z.array(z.array(z.string())),
  expectedSlipDays: z.number(),
});
export type BuildAnalysis = z.infer<typeof BuildAnalysisSchema>;

// ---------------------------------------------------------------------------
// Social simulation
// ---------------------------------------------------------------------------

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

export const CreativeThemeSchema = z.enum([
  "memes",
  "founder_led",
  "direct_response",
  "educational",
  "aspirational",
  "serious",
]);

export const AudienceCohortSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  populationShare: Trait,
  coreInterests: z.array(z.string()),
  coreValues: z.array(z.string()),
  commonObjections: z.array(z.string()),
  purchasingTriggers: z.array(z.string()),
  mediaDiet: z.array(PlatformSchema),
  baseline: z.object({
    humor: Trait,
    skepticism: Trait,
    influence: Trait,
    persuadability: Trait,
  }),
  color: z.string(),
});
export type AudienceCohort = z.infer<typeof AudienceCohortSchema>;

export const SyntheticPersonaSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  cohortId: z.string(),
  bio: z.string(),
  interests: z.array(z.string()),
  values: z.array(z.string()),
  objections: z.array(z.string()),
  purchasingTriggers: z.array(z.string()),
  humor: Trait,
  skepticism: Trait,
  influence: Trait,
  persuadability: Trait,
  preferredFormats: z.array(ContentFormatSchema),
  engagement: z.object({
    postRate: Trait,
    replyRate: Trait,
    repostRate: Trait,
    lurkRate: Trait,
  }),
});
export type SyntheticPersona = z.infer<typeof SyntheticPersonaSchema>;

export const SyntheticAudienceSchema = z.object({
  cohorts: z.array(AudienceCohortSchema).min(2),
  personas: z.array(SyntheticPersonaSchema).min(1),
  edges: z.array(
    z.object({ from: z.string(), to: z.string(), weight: Trait }),
  ),
  derivedFrom: z.array(z.string()),
});
export type SyntheticAudience = z.infer<typeof SyntheticAudienceSchema>;

export const CampaignStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  theme: CreativeThemeSchema,
  positioningThesis: z.string(),
  targetCohortIds: z.array(z.string()).min(1),
  centralMessage: z.string(),
  creativeDirection: z.string(),
  sampleLaunchPost: z.object({
    platform: PlatformSchema,
    body: z.string(),
    hashtags: z.array(z.string()),
  }),
  representativeImage: z.object({ prompt: z.string(), url: z.string().optional() }),
  callToAction: z.string(),
  contentMix: z.array(
    z.object({ format: ContentFormatSchema, platform: PlatformSchema, weight: Trait }),
  ),
  accent: z.string(),
});
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;

export const SimEventTypeSchema = z.enum([
  "impression",
  "like",
  "reply",
  "repost",
  "quote",
  "meme",
  "investigation",
  "belief_shift",
  "narrative_formed",
  "detractor_surfaced",
]);
export type SimEventType = z.infer<typeof SimEventTypeSchema>;

export const SimEventSchema = z.object({
  id: z.string(),
  tick: z.number().int().nonnegative(),
  type: SimEventTypeSchema,
  personaId: z.string(),
  cohortId: z.string(),
  targetPostId: z.string().optional(),
  body: z.string().optional(),
  sentiment: z.number().min(-1).max(1),
  llmBacked: z.boolean(),
  narrativeId: z.string().optional(),
});
export type SimEvent = z.infer<typeof SimEventSchema>;

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

/**
 * Comparative synthetic scores. These rank strategies against each other under
 * identical starting conditions — they are not real-world forecasts.
 */
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
