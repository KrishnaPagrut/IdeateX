/**
 * Drizzle/SQLite schema.
 *
 * Structured blobs (cohorts, personas, scores, form definitions) are stored as
 * JSON text columns rather than normalized tables. For a demo-first app the
 * shapes churn constantly and the Zod schemas in `../schemas.ts` are the real
 * source of truth, so normalizing them would buy migrations we don't want and
 * query flexibility we don't need.
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  productName: text("product_name").notNull(),
  /** CampaignBrief JSON */
  brief: text("brief").notNull(),
  /** ResearchReport JSON, populated after the research pass */
  research: text("research"),
  /** SyntheticAudience JSON */
  audience: text("audience"),
  /** CampaignStrategy[] JSON */
  strategies: text("strategies"),
  /** BuildPlanDesign + BuildAnalysis JSON, produced by the CTO role */
  buildPlan: text("build_plan"),
  objective: text("objective"),
  /** Strategy the user selected (or the merged result) */
  selectedStrategyId: text("selected_strategy_id"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const simulationRuns = sqliteTable(
  "simulation_runs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    strategyId: text("strategy_id").notNull(),
    status: text("status").notNull().default("pending"),
    ticks: integer("ticks").notNull().default(0),
    /** StrategyScores JSON, written when the run completes */
    scores: text("scores"),
    /** Narrative[] JSON */
    narratives: text("narratives"),
    /** SimulationResult JSON — full result including cohort breakdown */
    result: text("result"),
    /** Seed so a run is exactly reproducible on stage */
    seed: integer("seed").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({
    byCampaign: index("sim_runs_campaign_idx").on(t.campaignId),
  }),
);

export const simulationEvents = sqliteTable(
  "simulation_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => simulationRuns.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    type: text("type").notNull(),
    personaId: text("persona_id").notNull(),
    cohortId: text("cohort_id").notNull(),
    targetPostId: text("target_post_id"),
    body: text("body"),
    sentiment: integer("sentiment").notNull().default(0),
    llmBacked: integer("llm_backed", { mode: "boolean" })
      .notNull()
      .default(false),
    narrativeId: text("narrative_id"),
  },
  (t) => ({
    byRunTick: index("sim_events_run_tick_idx").on(t.runId, t.tick),
  }),
);

export const campaignItems = sqliteTable(
  "campaign_items",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Which role produced this artifact: cmo | cto */
    role: text("role").notNull().default("cmo"),
    state: text("state").notNull().default("draft"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    platform: text("platform").notNull(),
    /** string[] JSON */
    targetCohortIds: text("target_cohort_ids").notNull().default("[]"),
    purpose: text("purpose").notNull().default(""),
    callToAction: text("call_to_action"),
    hashtags: text("hashtags").notNull().default("[]"),
    imagePrompt: text("image_prompt"),
    imageUrl: text("image_url"),
    imageVariants: text("image_variants").notNull().default("[]"),
    /** FormDefinition JSON, including externalUrl once created */
    form: text("form"),
    linkedItemIds: text("linked_item_ids").notNull().default("[]"),
    version: integer("version").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => ({
    byCampaign: index("items_campaign_idx").on(t.campaignId),
    bySchedule: index("items_schedule_idx").on(t.campaignId, t.scheduledAt),
  }),
);

/**
 * Full snapshot of an item at each version, so any AI or manual edit is
 * undoable. Storing whole snapshots rather than diffs keeps restore trivial.
 */
export const itemVersions = sqliteTable(
  "item_versions",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => campaignItems.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** CampaignItem JSON snapshot taken BEFORE the change */
    snapshot: text("snapshot").notNull(),
    /** Which EditAction produced this, or 'manual' */
    changeSource: text("change_source").notNull(),
    changeSummary: text("change_summary"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({
    byItem: index("item_versions_item_idx").on(t.itemId, t.version),
  }),
);

/** Generated media and other artifacts, kept so regeneration is non-destructive. */
export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    itemId: text("item_id"),
    kind: text("kind").notNull(), // 'image' | 'copy' | 'form'
    prompt: text("prompt"),
    url: text("url"),
    /** Inline data URI for mock-generated images so the demo works offline */
    inlineData: text("inline_data"),
    provider: text("provider").notNull().default("mock"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({
    byCampaign: index("artifacts_campaign_idx").on(t.campaignId),
  }),
);

/** External form references, created only on explicit user action. */
export const externalForms = sqliteTable("external_forms", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => campaignItems.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

/** Audit trail — nothing publishes without a row here. */
export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => campaignItems.id, { onDelete: "cascade" }),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  actor: text("actor").notNull().default("user"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now),
});

export const scheduledJobs = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => campaignItems.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    runAt: text("run_at").notNull(),
    status: text("status").notNull().default("pending"),
    /** Populated after a (mock or real) publish succeeds */
    externalPostId: text("external_post_id"),
    error: text("error"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({
    byStatus: index("jobs_status_idx").on(t.status, t.runAt),
  }),
);

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  isMock: integer("is_mock", { mode: "boolean" }).notNull().default(true),
  accountHandle: text("account_handle"),
  /** ProviderCapabilities JSON */
  capabilities: text("capabilities").notNull(),
  createdAt: text("created_at").notNull().default(now),
});
