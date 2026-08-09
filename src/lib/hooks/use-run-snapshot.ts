"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentKind, AgentStatus, RunStatus, RunTier } from "@/lib/db/schema";

// Snapshot types mirror GET /api/runs/[runId] — DB rows after JSON
// serialization (timestamps become ISO strings, numerics stay strings).

export interface PersonaLite {
  id: string;
  name: string;
  archetype: string;
  avatarSeed: string;
}

export interface SnapshotRun {
  id: string;
  idea: string;
  context: string | null;
  tier: RunTier;
  grounding: boolean;
  status: RunStatus;
  brief: unknown;
  synthesis: unknown;
  aggregates: unknown;
  estCostUsd: string | null;
  actualCostUsd: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SnapshotAgentRun {
  id: string;
  runId: string;
  parentAgentRunId: string | null;
  kind: AgentKind;
  label: string;
  personaId: string | null;
  segment: string | null;
  status: AgentStatus;
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

export interface RunSnapshot {
  run: SnapshotRun;
  agents: SnapshotAgentRun[];
  personas: Record<string, PersonaLite>;
}

export interface UseRunSnapshotResult {
  data: RunSnapshot | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refetch: () => Promise<void>;
}

/** Initial (and on-demand) fetch of the run snapshot endpoint. */
export function useRunSnapshot(runId: string): UseRunSnapshotResult {
  const [data, setData] = useState<RunSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Render-phase reset when the target run changes (derived-state pattern).
  const [loadedRunId, setLoadedRunId] = useState(runId);
  if (loadedRunId !== runId) {
    setLoadedRunId(runId);
    setData(null);
    setLoading(true);
    setError(null);
    setNotFound(false);
  }

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        setError("Run not found");
        return;
      }
      if (!res.ok) {
        setError(`Could not load the run (HTTP ${res.status})`);
        return;
      }
      const snapshot = (await res.json()) as RunSnapshot;
      setData(snapshot);
      setError(null);
      setNotFound(false);
    } catch {
      setError("Could not load the run — check your connection");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    // Initial data fetch: every setState inside refetch happens after an await,
    // so nothing renders synchronously from this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  return { data, loading, error, notFound, refetch };
}
