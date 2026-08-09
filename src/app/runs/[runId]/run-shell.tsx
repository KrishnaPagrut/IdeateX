"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LaunchKitPanel } from "@/components/launch-kit/launch-kit-view";
import { ResultsView } from "@/components/results/results-view";
import { toRunAggregates } from "@/components/run-live/adapt";
import { AgentDrawer } from "@/components/run-live/agent-drawer";
import { AgentGraph } from "@/components/run-live/agent-graph";
import { RacePanel } from "@/components/run-live/race-panel";
import { StageProgress } from "@/components/run-live/stage-progress";
import type {
  AgentRunSnapshot,
  PersonaLite,
  RunSnapshot as VizRunSnapshot,
} from "@/components/run-live/types";
import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
  RaceResult,
} from "@/lib/schemas/marketing";
import type { MarketingReport } from "@/lib/schemas/report";
import type { RunStatus } from "@/lib/db/schema";
import { useRunSnapshot, type SnapshotAgentRun } from "@/lib/hooks/use-run-snapshot";
import { isTerminalStatus, useRunStream, type RunStreamState } from "@/lib/hooks/use-run-stream";
import { cn } from "@/lib/utils";
import {
  formatElapsed,
  formatUsd,
  isActiveStatus,
  STATUS_LABELS,
  statusBadgeClass,
  VERDICT_LABELS,
  verdictBadgeClass,
  verdictFromSynthesis,
} from "../format";

/**
 * Snapshot rows overlaid with live stream events: statuses freshen in place,
 * and agents that only exist as events yet (snapshot not refetched) appear as
 * minimal rows so the graph shows them immediately.
 */
function mergeAgents(
  snapshotAgents: SnapshotAgentRun[],
  streamAgents: RunStreamState["agents"],
  runId: string,
): AgentRunSnapshot[] {
  const byId = new Map<string, AgentRunSnapshot>();
  for (const row of snapshotAgents) byId.set(row.id, row);
  for (const [id, payload] of Object.entries(streamAgents)) {
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, { ...existing, status: payload.status, error: payload.error ?? existing.error });
    } else {
      byId.set(id, {
        id,
        runId,
        kind: payload.kind,
        label: payload.label,
        status: payload.status,
        parentAgentRunId: payload.parentAgentRunId,
        personaId: payload.personaId ?? null,
        segment: payload.segment ?? null,
        model: null,
        systemPrompt: null,
        userPrompt: null,
        output: null,
        rawText: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        error: payload.error ?? null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return [...byId.values()];
}

function useElapsed(startIso: string | null, endIso: string | null, running: boolean): string {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  if (!startIso) return "00:00";
  // A settled run with no recorded end (a stale run, or the moment between
  // live completion and the final snapshot refetch) has an unknowable
  // duration — wall-clock-since-start would show hours for a 2-minute run.
  if (!running && !endIso) return "—";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now;
  return formatElapsed(end - start);
}

export function RunShell({ runId }: { runId: string }) {
  const { data: snapshot, loading, error, notFound, refetch } = useRunSnapshot(runId);
  const stream = useRunStream(runId);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Results-first tab flow. `tab` holds the user's explicit choice — null
  // until they click a tab, so null doubles as "the user hasn't taken over".
  // Until then the shell decides: a run opened while already completed lands
  // on Results, an active run lands on Swarm and flips to Results when it
  // completes live. The landing decision comes from the SNAPSHOT status,
  // never the SSE stream — the stream replays historical statuses on connect,
  // so a completed run briefly "looks" active on it.
  const [tab, setTab] = React.useState<"swarm" | "results" | "launch-kit" | null>(null);
  const [landing, setLanding] = React.useState<"completed" | "active" | null>(null);
  const [autoSwitched, setAutoSwitched] = React.useState(false);

  React.useEffect(() => {
    if (!snapshot) return;
    // One-time sync from the first snapshot (an external system) into state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanding((prev) => prev ?? (snapshot.run.status === "completed" ? "completed" : "active"));
  }, [snapshot]);

  const agents = React.useMemo(
    () => mergeAgents(snapshot?.agents ?? [], stream.agents, runId),
    [snapshot?.agents, stream.agents, runId],
  );

  const handleSelect = React.useCallback(
    (agentRunId: string) => {
      setSelectedId(agentRunId);
      // Freshen prompts/output for agents that finished since the last snapshot.
      void refetch();
    },
    [refetch],
  );

  const status: RunStatus = stream.status ?? snapshot?.run.status ?? "pending";
  const terminal = isTerminalStatus(status);
  const active = isActiveStatus(status);

  // A watched run just completed: surface the report (subtly — a toast, and
  // the tab only moves if the user hasn't taken over the tabs themselves).
  React.useEffect(() => {
    if (landing !== "active" || status !== "completed" || autoSwitched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoSwitched(true);
    toast.success("Report ready");
  }, [landing, status, autoSwitched]);

  const resolvedTab: "swarm" | "results" | "launch-kit" =
    tab ?? (landing === "completed" || autoSwitched ? "results" : "swarm");

  // Once the run settles, pull the final snapshot (synthesis, costs, timings).
  const wasActiveRef = React.useRef(false);
  React.useEffect(() => {
    if (active) wasActiveRef.current = true;
    if (terminal && wasActiveRef.current) {
      wasActiveRef.current = false;
      void refetch();
    }
  }, [active, terminal, refetch]);

  const elapsed = useElapsed(
    snapshot?.run.startedAt ?? snapshot?.run.createdAt ?? null,
    terminal ? (snapshot?.run.finishedAt ?? null) : null,
    !terminal && snapshot !== null,
  );

  if (notFound || (error && !snapshot)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20">
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-card p-8">
          <p className="font-medium">{notFound ? "This run does not exist." : error}</p>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/runs" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to runs
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <DotmSquare3 colorPreset="solid-theme" size={36} dotSize={5} ariaLabel="Loading run" />
          <p className="font-mono text-xs tracking-eyebrow text-muted-foreground uppercase">
            Loading run
          </p>
        </div>
      </div>
    );
  }

  const { run } = snapshot;
  const personas = snapshot.personas as Record<string, PersonaLite>;
  const verdict = verdictFromSynthesis(run.synthesis);

  const rawRun = run as typeof run & {
    productName?: string | null;
    strategies?: unknown;
    race?: unknown;
    advisorReport?: unknown;
  };
  const vizRun: VizRunSnapshot = {
    ...run,
    brief: (run.brief as MarketingBrief | null) ?? null,
    synthesis: (run.synthesis as MarketingReport | null) ?? null,
    productName: rawRun.productName ?? null,
    strategies: (rawRun.strategies as CampaignStrategy[] | null) ?? null,
    race: (rawRun.race as RaceResult[] | null) ?? null,
    advisorReport:
      (rawRun.advisorReport as {
        consensus: AdvisorConsensus;
        verdicts: AdvisorVerdict[];
      } | null) ?? null,
    aggregates: toRunAggregates(run.aggregates, agents),
  };

  const selectedAgent = selectedId ? (agents.find((a) => a.id === selectedId) ?? null) : null;
  const selectedPersona = selectedAgent?.personaId
    ? (personas[selectedAgent.personaId] ?? null)
    : null;

  const cost =
    stream.costUsd !== null
      ? formatUsd(stream.costUsd)
      : (formatUsd(run.actualCostUsd) ?? (run.estCostUsd ? `est ${formatUsd(run.estCostUsd)}` : null));

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { cancelled?: boolean } | null;
      if (body?.cancelled) {
        toast.success("Run cancelled");
      } else {
        toast.info("The run had already finished");
      }
      void refetch();
    } catch {
      toast.error("Cancel failed — check your connection");
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  }

  return (
    <div className="w-full py-10">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/runs"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Runs
          </Link>
          <span className="text-border">/</span>
          <span className="font-mono text-xs text-muted-foreground">{runId.slice(0, 8)}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1
              className="line-clamp-2 max-w-prose font-serif text-2xl leading-snug font-bold tracking-tight"
              title={run.idea}
            >
              {run.idea}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={cn("font-mono text-3xs tracking-wider uppercase", statusBadgeClass(status))}>
                {STATUS_LABELS[status]}
              </Badge>
              {active && (
                <DotmSquare3 colorPreset="solid-theme" size={16} dotSize={2} ariaLabel="Run in progress" />
              )}
              <Badge variant="outline" className="font-mono text-3xs tracking-wider uppercase">
                {run.tier}
              </Badge>
              {run.grounding && (
                <Badge variant="outline" className="font-mono text-3xs tracking-wider uppercase">
                  grounded
                </Badge>
              )}
              {verdict && status === "completed" && (
                <Badge className={verdictBadgeClass(verdict)}>{VERDICT_LABELS[verdict]}</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex flex-col items-end">
              <span className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Elapsed
              </span>
              <span className="font-mono text-sm tabular-nums">{elapsed}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Cost
              </span>
              <span className="font-mono text-sm tabular-nums">{cost ?? "—"}</span>
            </div>
            {!terminal && (
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger render={<Button variant="outline" size="sm" />}>
                  Cancel run
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel this run?</DialogTitle>
                    <DialogDescription>
                      The swarm stops where it is. Money already spent stays spent; nothing else is
                      charged.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" size="sm" />}>
                      Keep running
                    </DialogClose>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelling}
                      onClick={handleCancel}
                    >
                      {cancelling ? "Cancelling…" : "Cancel run"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {status === "failed" && (stream.error ?? run.error) && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {stream.error ?? run.error}
          </p>
        )}
      </header>

      {/* Tabs */}
      <Tabs
        value={resolvedTab}
        onValueChange={(value) =>
          setTab(value === "results" ? "results" : value === "launch-kit" ? "launch-kit" : "swarm")
        }
        className="mt-8"
      >
        <div className="mx-auto w-full max-w-4xl px-6">
          <TabsList variant="line">
            <TabsTrigger value="swarm">Swarm</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            {run.status === "completed" && run.synthesis != null && (
              <TabsTrigger value="launch-kit">Launch kit</TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* The swarm map runs edge to edge — the canvas is the page itself,
            bounded by hairline rules, not a widget in a card. */}
        <TabsContent value="swarm" className="mt-5 flex flex-col">
          <div className="mx-auto w-full max-w-4xl px-6 pb-4">
            <StageProgress status={status} agents={agents} />
          </div>
          {Object.keys(stream.race).length > 0 && (
            <div className="mx-auto w-full max-w-4xl px-6 pb-5">
              <RacePanel race={stream.race} />
            </div>
          )}
          <div className="relative h-[max(620px,calc(100dvh-22rem))] border-y">
            <AgentGraph
              agents={agents}
              personas={personas}
              onSelect={handleSelect}
              selectedId={selectedId}
              className="h-full"
            />
            <p
              aria-hidden
              className="pointer-events-none absolute bottom-2 left-4 font-mono text-3xs tracking-eyebrow text-muted-foreground/70 uppercase"
            >
              drag to pan · scroll to zoom · click an agent to inspect
            </p>
          </div>
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          <div className="mx-auto w-full max-w-4xl px-6">
            {terminal && status !== "completed" && !run.synthesis ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  This run ended before a verdict — status: {STATUS_LABELS[status].toLowerCase()}.
                </p>
              </div>
            ) : (
              <ResultsView
                run={vizRun}
                agents={agents}
                personas={personas}
                onSelectAgent={handleSelect}
              />
            )}
          </div>
        </TabsContent>

        {run.status === "completed" && run.synthesis != null && (
          <TabsContent value="launch-kit" className="mt-6">
            <div className="mx-auto w-full max-w-4xl px-6">
              <LaunchKitPanel runId={runId} />
            </div>
          </TabsContent>
        )}
      </Tabs>

      <AgentDrawer
        agent={selectedAgent}
        persona={selectedPersona}
        personas={personas}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
