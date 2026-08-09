import type { AgentKind, AgentStatus, RunStatus, RunTier } from "@/lib/db/schema";
import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
  RaceResult,
} from "@/lib/schemas/marketing";
import type { MarketingReport } from "@/lib/schemas/report";

// ---------------------------------------------------------------------------
// UI-facing shapes. These are the wire shapes (JSON — dates are ISO strings),
// covering both the GET /api/runs/[runId] snapshot and live AgentEventPayload
// updates. The integrator maps either source into these.
// ---------------------------------------------------------------------------

/**
 * Minimal agent shape the graph needs. Snapshot AgentRun rows and live
 * AgentEventPayload events both project onto this.
 */
export interface AgentLite {
  id: string;
  kind: AgentKind;
  label: string;
  status: AgentStatus;
  parentAgentRunId: string | null;
  personaId?: string | null;
  segment?: string | null;
}

/** Minimal persona shape for graph nodes and quote cards. */
export interface PersonaLite {
  id: string;
  name: string;
  archetype: string;
  avatarSeed: string;
  demographics?: {
    age: number;
    gender: string;
    location: string;
    incomeBand: string;
    education: string;
    occupation: string;
  };
  psychographics?: {
    techSavviness: number;
    riskTolerance: number;
    priceSensitivity: number;
    openness: number;
    values: string[];
    spendingHabits: string;
  };
  backstory?: string;
}

/** Full agent_runs row as serialized by the snapshot API (dates as ISO strings). */
export interface AgentRunSnapshot extends AgentLite {
  runId: string;
  model: string | null;
  systemPrompt: string | null;
  userPrompt: string | null;
  output: unknown;
  rawText: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** Serialized runs row from the snapshot API. */
export interface RunSnapshot {
  id: string;
  idea: string;
  productName?: string | null;
  targetAudience?: string | null;
  objective?: string | null;
  context: string | null;
  tier: RunTier;
  grounding: boolean;
  status: RunStatus;
  brief: MarketingBrief | null;
  strategies?: CampaignStrategy[] | null;
  race?: RaceResult[] | null;
  advisorReport?: { consensus: AdvisorConsensus; verdicts: AdvisorVerdict[] } | null;
  synthesis: MarketingReport | null;
  aggregates: RunAggregates | null;
  estCostUsd: string | null;
  actualCostUsd: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Aggregates computed by the engine over persona verdicts. */
export interface RunAggregates {
  personaCount: number;
  completed: number;
  failed: number;
  meanAdoption: number;
  medianAdoption: number;
  adoptionHistogram: Array<{ min: number; max: number; count: number }>;
  emotionalBreakdown: Record<string, number>;
  recommendRate: number;
  meanWillingnessToPay: { amount: number; currency: string; cadence: string } | null;
  objectionFrequency: Array<{ objection: string; count: number }>;
  segmentStats: Array<{ segment: string; n: number; meanAdoption: number }>;
}

/** Shape of src/fixtures/run-fixture.json — the GET /api/runs/[runId] snapshot. */
export interface RunFixture {
  run: RunSnapshot;
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
}
