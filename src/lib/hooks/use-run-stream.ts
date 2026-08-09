"use client";

import { useEffect, useReducer } from "react";
import type { z } from "zod";

import type { RunStatus } from "@/lib/db/schema";
import {
  AgentEventPayload as AgentEventPayloadSchema,
  RunEventSchema,
  type RunEventMessage,
} from "@/lib/schemas/events";
import type { StrategyScores } from "@/lib/schemas/marketing";

export type AgentEventPayload = z.infer<typeof AgentEventPayloadSchema>;

/** Live per-strategy race state, accumulated from sim:tick events. */
export interface RaceStrategyState {
  strategyId: string;
  strategyName: string;
  tick: number;
  totalTicks: number;
  scores: StrategyScores;
  reachedCount: number;
  personaCount: number;
  /** Persona ids in activation order (cumulative across ticks). */
  activatedPersonaIds: string[];
  topNarratives: Array<{ id: string; label: string; sentiment: number; momentum: number }>;
  finished: boolean;
}

export const RUN_STAGES = [
  "framing",
  "planning",
  "strategizing",
  "racing",
  "advising",
  "simulating",
  "discussing",
  "critiquing",
  "synthesizing",
] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export interface StageState {
  started: boolean;
  completed: boolean;
  agentCount?: number;
}

export interface RunStreamState {
  /** Latest run status seen on the stream; null until the first run:status event. */
  status: RunStatus | null;
  stages: Record<RunStage, StageState>;
  /** Latest agent event per agentRunId. */
  agents: Record<string, AgentEventPayload>;
  /** Live race state per strategy id; empty until the first sim:tick. */
  race: Record<string, RaceStrategyState>;
  /** Latest cost:update total; null until the first one. */
  costUsd: number | null;
  lastSeq: number;
  error: string | null;
  connected: boolean;
}

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "stale",
]);

export function isTerminalStatus(status: RunStatus | null): boolean {
  return status !== null && TERMINAL_STATUSES.has(status);
}

function emptyStages(): Record<RunStage, StageState> {
  return {
    framing: { started: false, completed: false },
    planning: { started: false, completed: false },
    strategizing: { started: false, completed: false },
    racing: { started: false, completed: false },
    advising: { started: false, completed: false },
    simulating: { started: false, completed: false },
    discussing: { started: false, completed: false },
    critiquing: { started: false, completed: false },
    synthesizing: { started: false, completed: false },
  };
}

function initialState(): RunStreamState {
  return {
    status: null,
    stages: emptyStages(),
    agents: {},
    race: {},
    costUsd: null,
    lastSeq: 0,
    error: null,
    connected: false,
  };
}

type Action =
  | { type: "event"; event: RunEventMessage }
  | { type: "connected"; connected: boolean }
  | { type: "reset" };

function reducer(state: RunStreamState, action: Action): RunStreamState {
  switch (action.type) {
    case "reset":
      return initialState();
    case "connected":
      return state.connected === action.connected
        ? state
        : { ...state, connected: action.connected };
    case "event": {
      const event = action.event;
      // Replays after a reconnect can overlap what we already saw.
      if (event.seq <= state.lastSeq) return state;
      const next: RunStreamState = { ...state, lastSeq: event.seq };
      switch (event.type) {
        case "run:status":
          next.status = event.payload.status;
          if (event.payload.error) next.error = event.payload.error;
          break;
        case "stage:started":
          next.stages = {
            ...state.stages,
            [event.payload.stage]: {
              started: true,
              completed: false,
              agentCount: event.payload.agentCount,
            },
          };
          break;
        case "stage:completed":
          next.stages = {
            ...state.stages,
            [event.payload.stage]: {
              ...state.stages[event.payload.stage],
              started: true,
              completed: true,
            },
          };
          break;
        case "agent:started":
        case "agent:completed":
        case "agent:failed":
          next.agents = { ...state.agents, [event.payload.agentRunId]: event.payload };
          break;
        case "sim:tick": {
          const p = event.payload;
          const prev = state.race[p.strategyId];
          next.race = {
            ...state.race,
            [p.strategyId]: {
              strategyId: p.strategyId,
              strategyName: p.strategyName,
              tick: p.tick,
              totalTicks: p.totalTicks,
              scores: p.scores,
              reachedCount: p.reachedCount,
              personaCount: p.personaCount,
              activatedPersonaIds: [
                ...(prev?.activatedPersonaIds ?? []),
                ...p.activatedPersonaIds,
              ],
              topNarratives: p.topNarratives,
              finished: p.tick >= p.totalTicks,
            },
          };
          break;
        }
        case "race:completed":
          next.race = Object.fromEntries(
            Object.entries(state.race).map(([id, s]) => [id, { ...s, finished: true }]),
          );
          break;
        case "cost:update":
          next.costUsd = event.payload.totalUsd;
          break;
      }
      return next;
    }
  }
}

/**
 * Live-follows a run over SSE. Replays persisted events on connect, then
 * streams live ones; the browser's EventSource re-sends Last-Event-ID on
 * reconnect so no events are lost or double-applied (seq-deduped in the
 * reducer). Malformed events are skipped. The stream is closed once a
 * terminal run status arrives.
 */
export function useRunStream(runId: string): RunStreamState {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    dispatch({ type: "reset" });
    const source = new EventSource(`/api/runs/${runId}/events`);

    source.onopen = () => dispatch({ type: "connected", connected: true });
    source.onerror = () => dispatch({ type: "connected", connected: false });
    source.onmessage = (message: MessageEvent<string>) => {
      let parsed: ReturnType<typeof RunEventSchema.safeParse>;
      try {
        parsed = RunEventSchema.safeParse(JSON.parse(message.data));
      } catch {
        return; // not JSON — skip
      }
      if (!parsed.success) return; // unknown shape — skip

      dispatch({ type: "event", event: parsed.data });

      if (
        parsed.data.type === "run:status" &&
        TERMINAL_STATUSES.has(parsed.data.payload.status)
      ) {
        source.close();
        dispatch({ type: "connected", connected: false });
      }
    };

    return () => source.close();
  }, [runId]);

  return state;
}
