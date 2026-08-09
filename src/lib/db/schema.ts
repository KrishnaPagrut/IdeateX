import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enum value lists (kept as TS unions + text columns so adding a value never
// requires a migration; zod validates at the boundary — see lib/schemas)
// ---------------------------------------------------------------------------

export const RUN_TIERS = ["quick", "standard", "deep"] as const;
export type RunTier = (typeof RUN_TIERS)[number];

export const RUN_STATUSES = [
  "pending",
  "framing",
  "planning",
  "strategizing",
  "racing",
  "advising",
  "simulating",
  "discussing",
  "critiquing",
  "synthesizing",
  "completed",
  "failed",
  "cancelled",
  "stale",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const AGENT_KINDS = [
  "framing",
  "planner",
  "strategy",
  "reaction",
  "advisor",
  "moderator",
  "persona",
  "discussion",
  "critique",
  "synthesis",
] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const AGENT_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const personas = pgTable(
  "personas",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  archetype: text("archetype").notNull(),
  // Pool taxonomy: personas live in domain/subdomain pools (~20-30 each) that
  // planners request by name in casting specs. See src/lib/personas/taxonomy.ts.
  domain: text("domain").notNull().default("general"),
  subdomain: text("subdomain").notNull().default("general"),
  demographics: jsonb("demographics")
    .$type<{
      age: number;
      gender: string;
      location: string;
      incomeBand: string;
      education: string;
      occupation: string;
    }>()
    .notNull(),
  psychographics: jsonb("psychographics")
    .$type<{
      techSavviness: number; // 1-5
      riskTolerance: number; // 1-5
      priceSensitivity: number; // 1-5
      openness: number; // 1-5
      values: string[];
      spendingHabits: string;
    }>()
    .notNull(),
  backstory: text("backstory").notNull(),
  avatarSeed: text("avatar_seed").notNull(),
  tags: text("tags").array().notNull().default([]),
  source: text("source").$type<"seed" | "generated" | "edited">().notNull().default("seed"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("personas_pool_idx").on(t.domain, t.subdomain)],
);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Product description (the marketing pipeline's main stimulus text). */
  idea: text("idea").notNull(),
  context: text("context"),
  // Marketing-run inputs (nullable: legacy rows predate the pivot).
  productName: text("product_name"),
  targetAudience: text("target_audience"),
  objective: text("objective"),
  tier: text("tier").$type<RunTier>().notNull().default("standard"),
  grounding: boolean("grounding").notNull().default(false),
  // Focus-group stage: personas hear segment peers' verdicts and respond.
  discussion: boolean("discussion").notNull().default(false),
  // Max personas this run may spawn; null = tier default (TIER_SHAPE).
  personaBudget: integer("persona_budget"),
  status: text("status").$type<RunStatus>().notNull().default("pending"),
  brief: jsonb("brief"),
  // Marketing pipeline artifacts, in stage order.
  audience: jsonb("audience"),
  strategies: jsonb("strategies"),
  race: jsonb("race"),
  advisorReport: jsonb("advisor_report"),
  synthesis: jsonb("synthesis"),
  aggregates: jsonb("aggregates"),
  estCostUsd: numeric("est_cost_usd", { precision: 10, scale: 4 }),
  actualCostUsd: numeric("actual_cost_usd", { precision: 10, scale: 4 }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    // Builds the swarm graph: framing → planners → personas; critique/synthesis
    // attach per the orchestrator's parent assignments.
    parentAgentRunId: uuid("parent_agent_run_id"),
    kind: text("kind").$type<AgentKind>().notNull(),
    label: text("label").notNull(),
    personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
    segment: text("segment"),
    status: text("status").$type<AgentStatus>().notNull().default("pending"),
    model: text("model"),
    systemPrompt: text("system_prompt"),
    userPrompt: text("user_prompt"),
    output: jsonb("output"),
    rawText: text("raw_text"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_runs_run_id_idx").on(t.runId)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    agentRunId: uuid("agent_run_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("run_events_run_id_idx").on(t.runId),
    uniqueIndex("run_events_run_id_seq_idx").on(t.runId, t.seq),
  ],
);

export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
