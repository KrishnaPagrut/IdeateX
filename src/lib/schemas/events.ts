import { z } from "zod";
import { AGENT_KINDS, AGENT_STATUSES, RUN_STATUSES } from "@/lib/db/schema";
import { RaceResultSchema, StrategyScoresSchema } from "./marketing";

// ---------------------------------------------------------------------------
// Run event payloads — the wire format between engine and UI (via run_events
// rows replayed over SSE). Any change here is a cross-workstream change.
// ---------------------------------------------------------------------------

export const RUN_EVENT_TYPES = [
  "run:status",
  "stage:started",
  "stage:completed",
  "agent:started",
  "agent:completed",
  "agent:failed",
  "sim:tick",
  "race:completed",
  "cost:update",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

export const RunStatusEventPayload = z.object({
  status: z.enum(RUN_STATUSES),
  error: z.string().optional(),
});

export const StageEventPayload = z.object({
  stage: z.enum([
    "framing",
    "planning",
    "strategizing",
    "racing",
    "advising",
    "simulating",
    "discussing",
    "critiquing",
    "synthesizing",
  ]),
  /** Number of agents this stage will run (for progress bars); set on stage:started */
  agentCount: z.number().optional(),
});

export const AgentEventPayload = z.object({
  agentRunId: z.string(),
  kind: z.enum(AGENT_KINDS),
  label: z.string(),
  status: z.enum(AGENT_STATUSES),
  parentAgentRunId: z.string().nullable(),
  personaId: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  error: z.string().optional(),
});

export const CostUpdatePayload = z.object({
  totalUsd: z.number(),
});

export const SimTickPayload = z.object({
  strategyId: z.string(),
  strategyName: z.string(),
  tick: z.number(),
  totalTicks: z.number(),
  scores: StrategyScoresSchema,
  reachedCount: z.number(),
  personaCount: z.number(),
  /** Personas newly reached THIS tick (delta), for dot animation. */
  activatedPersonaIds: z.array(z.string()),
  topNarratives: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        sentiment: z.number(),
        momentum: z.number(),
      }),
    )
    .max(4),
});

export const RaceCompletedPayload = z.object({
  results: z.array(RaceResultSchema),
});

/** Discriminated union used by the UI reducer. `seq` mirrors run_events.seq and is the SSE event id. */
export const RunEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run:status"), seq: z.number(), payload: RunStatusEventPayload }),
  z.object({ type: z.literal("stage:started"), seq: z.number(), payload: StageEventPayload }),
  z.object({ type: z.literal("stage:completed"), seq: z.number(), payload: StageEventPayload }),
  z.object({ type: z.literal("agent:started"), seq: z.number(), payload: AgentEventPayload }),
  z.object({ type: z.literal("agent:completed"), seq: z.number(), payload: AgentEventPayload }),
  z.object({ type: z.literal("agent:failed"), seq: z.number(), payload: AgentEventPayload }),
  z.object({ type: z.literal("sim:tick"), seq: z.number(), payload: SimTickPayload }),
  z.object({ type: z.literal("race:completed"), seq: z.number(), payload: RaceCompletedPayload }),
  z.object({ type: z.literal("cost:update"), seq: z.number(), payload: CostUpdatePayload }),
]);

export type RunEventMessage = z.infer<typeof RunEventSchema>;
