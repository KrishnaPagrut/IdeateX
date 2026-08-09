/**
 * Zod schemas for every structured model output in LaunchLab.
 *
 * These are the contract between the LLM provider (real Grok or the
 * deterministic mock) and the rest of the app. Anything the model returns is
 * parsed through here before it touches the database or the UI, so a bad
 * generation fails loudly at the boundary instead of corrupting a campaign.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
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
export type Platform = z.infer<typeof PlatformSchema>;

export const CreativeThemeSchema = z.enum([
  "memes",
  "founder_led",
  "direct_response",
  "educational",
  "aspirational",
  "serious",
]);
export type CreativeTheme = z.infer<typeof CreativeThemeSchema>;

export const BrandVoiceSchema = z.enum([
  "playful",
  "authoritative",
  "warm",
  "irreverent",
  "technical",
  "minimal",
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

/** A 0-100 comparative synthetic score. Never a real-world forecast. */
export const ScoreSchema = z.number().min(0).max(100);

/** A 0-1 normalized trait weight. */
export const TraitSchema = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Campaign brief — the user's intake
// ---------------------------------------------------------------------------

export const CampaignBriefSchema = z.object({
  productName: z.string().min(1),
  productUrl: z.string().url().optional().or(z.literal("")),
  productDescription: z.string().min(1),
  objective: z.string().min(1),
  launchDate: z.string(), // ISO date
  targetMarket: z.string().min(1),
  platforms: z.array(PlatformSchema).min(1),
  brandVoice: BrandVoiceSchema,
  themes: z.array(CreativeThemeSchema).min(1),
});
export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export const ResearchFindingSchema = z.object({
  id: z.string(),
  source: z.enum(["x_search", "web_search", "grok_synthesis"]),
  title: z.string(),
  summary: z.string(),
  url: z.string().optional(),
  /** Aggregate sentiment observed in public discourse, -1 to 1. */
  sentiment: z.number().min(-1).max(1),
  salience: TraitSchema,
  tags: z.array(z.string()),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

export const ResearchReportSchema = z.object({
  category: z.string(),
  categorySummary: z.string(),
  findings: z.array(ResearchFindingSchema),
  observedTensions: z.array(z.string()),
  vocabulary: z.array(z.string()),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

// ---------------------------------------------------------------------------
// Synthetic audience
//
// IMPORTANT: cohorts and personas are FICTIONAL ARCHETYPES derived from
// aggregate behavior patterns. They are never modeled on identifiable people.
// ---------------------------------------------------------------------------

export const SyntheticPersonaSchema = z.object({
  id: z.string(),
  /** Fictional handle. Must not correspond to a real account. */
  handle: z.string(),
  displayName: z.string(),
  cohortId: z.string(),
  bio: z.string(),
  interests: z.array(z.string()),
  values: z.array(z.string()),
  objections: z.array(z.string()),
  purchasingTriggers: z.array(z.string()),
  humor: TraitSchema,
  skepticism: TraitSchema,
  influence: TraitSchema,
  /** How readily this persona changes its stance when challenged. */
  persuadability: TraitSchema,
  preferredFormats: z.array(ContentFormatSchema),
  engagement: z.object({
    postRate: TraitSchema,
    replyRate: TraitSchema,
    repostRate: TraitSchema,
    lurkRate: TraitSchema,
  }),
});
export type SyntheticPersona = z.infer<typeof SyntheticPersonaSchema>;

export const AudienceCohortSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Share of the synthetic population, 0-1. Cohorts should sum to ~1. */
  populationShare: TraitSchema,
  coreInterests: z.array(z.string()),
  coreValues: z.array(z.string()),
  commonObjections: z.array(z.string()),
  purchasingTriggers: z.array(z.string()),
  mediaDiet: z.array(PlatformSchema),
  /** Aggregate cohort-level trait baselines; personas vary around these. */
  baseline: z.object({
    humor: TraitSchema,
    skepticism: TraitSchema,
    influence: TraitSchema,
    persuadability: TraitSchema,
  }),
  color: z.string(),
});
export type AudienceCohort = z.infer<typeof AudienceCohortSchema>;

/**
 * What the model is actually asked for. Personas are then derived in code as
 * statistical variations around these baselines — asking a model to emit 48
 * near-identical persona objects is slow, expensive, and produces less
 * variance than sampling does.
 */
export const AudienceDesignSchema = z.object({
  cohorts: z.array(AudienceCohortSchema).min(3).max(5),
});
export type AudienceDesign = z.infer<typeof AudienceDesignSchema>;

export const SyntheticAudienceSchema = z.object({
  cohorts: z.array(AudienceCohortSchema).min(2),
  personas: z.array(SyntheticPersonaSchema).min(1),
  /** Directed follow edges between personas, for influence propagation. */
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      weight: TraitSchema,
    }),
  ),
  derivedFrom: z.array(z.string()),
});
export type SyntheticAudience = z.infer<typeof SyntheticAudienceSchema>;

// ---------------------------------------------------------------------------
// Campaign strategies
// ---------------------------------------------------------------------------

export const ContentMixEntrySchema = z.object({
  format: ContentFormatSchema,
  platform: PlatformSchema,
  /** Proportion of the campaign devoted to this format, 0-1. */
  weight: TraitSchema,
});

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
  representativeImage: z.object({
    prompt: z.string(),
    url: z.string().optional(),
  }),
  callToAction: z.string(),
  contentMix: z.array(ContentMixEntrySchema).min(1),
  /** Accent color used to keep the three strategies visually distinct. */
  accent: z.string(),
});
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

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
  /** True when this event came from a Grok call rather than the fast path. */
  llmBacked: z.boolean(),
  narrativeId: z.string().optional(),
});
export type SimEvent = z.infer<typeof SimEventSchema>;

export const NarrativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  sentiment: z.number().min(-1).max(1),
  /** Personas currently carrying this narrative. */
  carrierIds: z.array(z.string()),
  firstSeenTick: z.number().int().nonnegative(),
  momentum: z.number(),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

/**
 * The eight comparative axes. These are SYNTHETIC RELATIVE SCORES used to rank
 * strategies against one another under identical starting conditions. They are
 * explicitly not predictions of real-world campaign performance.
 */
export const StrategyScoresSchema = z.object({
  reach: ScoreSchema,
  trust: ScoreSchema,
  messageComprehension: ScoreSchema,
  purchaseIntent: ScoreSchema,
  sharePropensity: ScoreSchema,
  controversy: ScoreSchema,
  audienceFit: ScoreSchema,
  brandSafetyRisk: ScoreSchema,
});
export type StrategyScores = z.infer<typeof StrategyScoresSchema>;

export const SimulationResultSchema = z.object({
  strategyId: z.string(),
  runId: z.string(),
  ticks: z.number().int().positive(),
  scores: StrategyScoresSchema,
  narratives: z.array(NarrativeSchema),
  /** Per-cohort reception, for the "why did this win" breakdown. */
  cohortBreakdown: z.array(
    z.object({
      cohortId: z.string(),
      reach: ScoreSchema,
      sentiment: z.number().min(-1).max(1),
      purchaseIntent: ScoreSchema,
    }),
  ),
  representativeReactions: z.array(
    z.object({
      personaId: z.string(),
      handle: z.string(),
      cohortId: z.string(),
      body: z.string(),
      sentiment: z.number().min(-1).max(1),
    }),
  ),
  explanation: z.string(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

// ---------------------------------------------------------------------------
// Company, objectives, and roles
//
// A company is the durable context. An objective is a unit of work delegated
// to a role. Each role gathers its own evidence, analyses it, and emits typed
// artifacts — but they all share the same evidence → findings → artifacts
// shape, which is what makes two very different roles feel like one product.
// ---------------------------------------------------------------------------

export const RoleIdSchema = z.enum(["cto", "cmo"]);
export type RoleId = z.infer<typeof RoleIdSchema>;

export const CompanySchema = z.object({
  name: z.string().min(1),
  idea: z.string().min(1),
  url: z.string().optional().or(z.literal("")),
  stage: z.enum(["idea", "prototype", "pre_launch", "launched"]),
  targetMarket: z.string().min(1),
  /** Free-text constraints: team size, runway, tech preferences, deadlines. */
  context: z.string().default(""),
});
export type Company = z.infer<typeof CompanySchema>;

export const ObjectiveSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  statement: z.string().min(1),
  role: RoleIdSchema,
  status: z.enum(["pending", "analysing", "complete", "failed"]),
  createdAt: z.string(),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

// ---------------------------------------------------------------------------
// CTO — build plan, dependencies, and risk
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
  /** Rough size. Used to weight the critical path. */
  estimateDays: z.number().min(0.5).max(30),
  /** Ids of tasks that must land before this one can start. */
  dependsOn: z.array(z.string()),
  /** 0-1 chance this task overruns or blocks, judged from unknowns. */
  risk: TraitSchema,
  riskReason: z.string(),
});
export type EngTask = z.infer<typeof EngTaskSchema>;

export const BuildPlanDesignSchema = z.object({
  summary: z.string(),
  /** Task ids must be t_0, t_1, … so dependency references stay resolvable. */
  tasks: z.array(EngTaskSchema).min(4),
  /** Technical unknowns worth resolving before committing to the plan. */
  openQuestions: z.array(z.string()),
  stack: z.array(z.string()),
});
export type BuildPlanDesign = z.infer<typeof BuildPlanDesignSchema>;

/** Computed in code from the task graph — never asked of the model. */
export const BuildAnalysisSchema = z.object({
  /** Task ids on the longest dependency chain, in order. */
  criticalPath: z.array(z.string()),
  criticalPathDays: z.number(),
  /** Total days if everything with no dependency ran in parallel. */
  parallelFloorDays: z.number(),
  /** Tasks blocking the most downstream work, most blocking first. */
  bottlenecks: z.array(
    z.object({ taskId: z.string(), blocksCount: z.number(), risk: TraitSchema }),
  ),
  /** Dependency cycles, if the model produced any. */
  cycles: z.array(z.array(z.string())),
  /** Sum of estimate × risk — expected slippage in days. */
  expectedSlipDays: z.number(),
});
export type BuildAnalysis = z.infer<typeof BuildAnalysisSchema>;

// ---------------------------------------------------------------------------
// Findings — the connective tissue between analysis and artifact generation
//
// A finding is a legible, attributable lesson pulled out of the simulation
// ("the price framing triggered objections in the skeptic cohort"). Findings
// are fed directly into asset generation as constraints, which is what makes
// the generated timeline a consequence of the simulation rather than an
// unrelated second feature.
// ---------------------------------------------------------------------------

export const FindingSchema = z.object({
  id: z.string(),
  kind: z.enum(["worked", "failed", "risk", "opportunity"]),
  headline: z.string(),
  detail: z.string(),
  /** Cohorts this finding is about. */
  cohortIds: z.array(z.string()),
  /**
   * Which axis this finding most affected. Marketing axes come from the
   * simulation's eight scores; engineering axes from the build analysis. The
   * shared enum is what lets one UI render findings from either role.
   */
  axis: z.enum([
    // CMO
    "reach",
    "trust",
    "messageComprehension",
    "purchaseIntent",
    "sharePropensity",
    "controversy",
    "audienceFit",
    "brandSafetyRisk",
    // CTO
    "criticalPath",
    "dependencyRisk",
    "parallelism",
    "scopeRisk",
    "unknowns",
  ]),
  /** How strongly this should steer downstream generation, 0-1. */
  weight: TraitSchema,
  /** Sim events that justify this finding, for the "show your work" drill-down. */
  evidenceEventIds: z.array(z.string()),
  /** Imperative guidance handed to the asset generator. */
  directive: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FindingsReportSchema = z.object({
  campaignId: z.string(),
  winningStrategyId: z.string(),
  whyItWon: z.string(),
  findings: z.array(FindingSchema),
  /** Cross-strategy lessons worth carrying into the timeline regardless. */
  carryOver: z.array(z.string()),
});
export type FindingsReport = z.infer<typeof FindingsReportSchema>;

// ---------------------------------------------------------------------------
// Campaign timeline items
// ---------------------------------------------------------------------------

export const CampaignItemKindSchema = z.enum([
  "x_post",
  "x_thread",
  "instagram_post",
  "instagram_carousel",
  "image_ad",
  "poll",
  "survey",
  "lead_form",
  "landing_section",
  "product_demo",
  "community_prompt",
  "follow_up",
  "response_template",
  // CTO artifacts
  "eng_task",
  "pr_draft",
  "arch_note",
  "spike",
]);
export type CampaignItemKind = z.infer<typeof CampaignItemKindSchema>;

export const ItemStateSchema = z.enum([
  "draft",
  "needs_review",
  "approved",
  "scheduled",
  "published",
]);
export type ItemState = z.infer<typeof ItemStateSchema>;

export const FormQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  type: z.enum([
    "short_text",
    "long_text",
    "multiple_choice",
    "checkboxes",
    "rating",
    "email",
    "number",
  ]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
});
export type FormQuestion = z.infer<typeof FormQuestionSchema>;

/**
 * An internal form definition. This is generated and previewed locally; no
 * external form is created until the user explicitly clicks "Create form".
 */
export const FormDefinitionSchema = z.object({
  title: z.string(),
  description: z.string(),
  questions: z.array(FormQuestionSchema).min(1),
  completionMessage: z.string(),
  redirectUrl: z.string().optional(),
  /** Populated only after the user creates the form with a real provider. */
  externalUrl: z.string().optional(),
  externalProvider: z.enum(["tally", "mock"]).optional(),
  externalId: z.string().optional(),
});
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

export const CampaignItemSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  kind: CampaignItemKindSchema,
  state: ItemStateSchema,
  title: z.string(),
  body: z.string(),
  /** ISO datetime this item is planned for. */
  scheduledAt: z.string(),
  platform: PlatformSchema,
  targetCohortIds: z.array(z.string()),
  purpose: z.string(),
  callToAction: z.string().optional(),
  hashtags: z.array(z.string()),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  imageVariants: z.array(z.string()).default([]),
  form: FormDefinitionSchema.optional(),
  linkedItemIds: z.array(z.string()).default([]),
  /** Monotonic version counter; every edit writes a version row. */
  version: z.number().int().nonnegative(),
});
export type CampaignItem = z.infer<typeof CampaignItemSchema>;

/** What the model returns when expanding a strategy into a timeline. */
export const GeneratedTimelineSchema = z.object({
  items: z
    .array(
      CampaignItemSchema.omit({
        id: true,
        campaignId: true,
        state: true,
        version: true,
        imageVariants: true,
        linkedItemIds: true,
      }),
    )
    .min(1),
});
export type GeneratedTimeline = z.infer<typeof GeneratedTimelineSchema>;

// ---------------------------------------------------------------------------
// Granular AI edit actions
// ---------------------------------------------------------------------------

export const EditActionSchema = z.enum([
  "rewrite_shorter",
  "make_more_direct",
  "make_funnier",
  "adapt_for_platform",
  "generate_alternatives",
  "replace_hook",
  "replace_cta",
  "regenerate_image",
  "add_follow_up",
  "resimulate",
  "move_date",
]);
export type EditAction = z.infer<typeof EditActionSchema>;

export const EditResultSchema = z.object({
  body: z.string().optional(),
  callToAction: z.string().optional(),
  imagePrompt: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  alternatives: z.array(z.string()).optional(),
  note: z.string().optional(),
});
export type EditResult = z.infer<typeof EditResultSchema>;

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export const ProviderCapabilitiesSchema = z.object({
  publish: z.boolean(),
  schedule: z.boolean(),
  media: z.boolean(),
  analytics: z.boolean(),
  forms: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(["x", "instagram", "linkedin", "tally", "demo"]),
  label: z.string(),
  connected: z.boolean(),
  isMock: z.boolean(),
  capabilities: ProviderCapabilitiesSchema,
  accountHandle: z.string().optional(),
});
export type Connection = z.infer<typeof ConnectionSchema>;
