"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentKind, RunStatus } from "@/lib/db/schema";
import { useRunSnapshot } from "@/lib/hooks/use-run-snapshot";
import {
  isTerminalStatus,
  RUN_STAGES,
  useRunStream,
  type RunStage,
  type RunStreamState,
} from "@/lib/hooks/use-run-stream";
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

const STAGE_KIND: Record<RunStage, AgentKind> = {
  framing: "framing",
  planning: "planner",
  simulating: "persona",
  critiquing: "critique",
  synthesizing: "synthesis",
};

const STAGE_LABELS: Record<RunStage, string> = {
  framing: "Framing",
  planning: "Planning",
  simulating: "Simulating",
  critiquing: "Critiquing",
  synthesizing: "Synthesizing",
};

interface StageView {
  stage: RunStage;
  label: string;
  state: "pending" | "active" | "completed";
  done: number;
  failed: number;
  total: number | null;
}

/**
 * Per-stage progress derived from the live stream, with the snapshot filling
 * in whatever happened before this client connected (replay usually covers
 * it, but a completed run with a closed stream still renders correctly).
 */
function deriveStages(
  status: RunStatus,
  stream: RunStreamState,
  snapshotAgents: Array<{ id: string; kind: AgentKind; status: string }>,
): StageView[] {
  // Union of snapshot agent rows and live agent events, keyed by id.
  const agentById = new Map<string, { kind: AgentKind; status: string }>();
  for (const agent of snapshotAgents) agentById.set(agent.id, agent);
  for (const [id, payload] of Object.entries(stream.agents)) {
    agentById.set(id, { kind: payload.kind, status: payload.status });
  }

  const statusIdx = (RUN_STAGES as readonly string[]).indexOf(status);
  const allDone = status === "completed";

  return RUN_STAGES.map((stage, idx) => {
    const live = stream.stages[stage];
    const completed = allDone || live.completed || (statusIdx >= 0 && idx < statusIdx);
    const started = completed || live.started || statusIdx === idx;

    const kind = STAGE_KIND[stage];
    let done = 0;
    let failed = 0;
    let seen = 0;
    for (const agent of agentById.values()) {
      if (agent.kind !== kind) continue;
      seen += 1;
      if (agent.status === "completed") done += 1;
      if (agent.status === "failed") failed += 1;
    }
    const total = live.agentCount ?? (seen > 0 ? seen : null);

    return {
      stage,
      label: STAGE_LABELS[stage],
      state: completed ? "completed" : started ? "active" : "pending",
      done,
      failed,
      total,
    };
  });
}

function useElapsed(startIso: string | null, endIso: string | null, running: boolean): string {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  if (!startIso) return "00:00";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now;
  return formatElapsed(end - start);
}

export function RunShell({ runId }: { runId: string }) {
  const { data: snapshot, loading, error, notFound, refetch } = useRunSnapshot(runId);
  const stream = useRunStream(runId);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const status: RunStatus = stream.status ?? snapshot?.run.status ?? "pending";
  const terminal = isTerminalStatus(status);
  const active = isActiveStatus(status);

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
          <Button variant="outline" size="sm" render={<Link href="/runs" />}>
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
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Loading run
          </p>
        </div>
      </div>
    );
  }

  const { run } = snapshot;
  const stages = deriveStages(status, stream, snapshot.agents);
  const verdict = verdictFromSynthesis(run.synthesis);

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
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      {/* Header */}
      <header className="flex flex-col gap-4">
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
            <h1 className="line-clamp-2 max-w-prose text-xl font-semibold tracking-tight" title={run.idea}>
              {run.idea}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={cn("font-mono text-[10px] tracking-wider uppercase", statusBadgeClass(status))}>
                {STATUS_LABELS[status]}
              </Badge>
              {active && (
                <DotmSquare3 colorPreset="solid-theme" size={16} dotSize={2} ariaLabel="Run in progress" />
              )}
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
                {run.tier}
              </Badge>
              {run.grounding && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
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
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Elapsed
              </span>
              <span className="font-mono text-sm tabular-nums">{elapsed}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
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
      <Tabs defaultValue="swarm" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="swarm">Swarm</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="swarm" className="mt-4">
          {/* Placeholder panel — workstream C's swarm graph replaces this at integration. */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Pipeline telemetry
              </span>
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">
                Swarm graph lands at integration
              </span>
            </div>
            <ol className="flex flex-col divide-y">
              {stages.map((s, i) => (
                <li key={s.stage} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        s.state === "pending" ? "text-muted-foreground" : "font-medium",
                      )}
                    >
                      {s.label}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {s.total !== null && (
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {s.done}/{s.total} agents
                          {s.failed > 0 && (
                            <span className="text-destructive"> · {s.failed} failed</span>
                          )}
                        </span>
                      )}
                      {s.state === "completed" && <CheckIcon className="size-4 text-primary" />}
                      {s.state === "active" && (
                        <DotmSquare3
                          colorPreset="solid-theme"
                          size={16}
                          dotSize={2}
                          ariaLabel={`${s.label} in progress`}
                        />
                      )}
                      {s.state === "pending" && (
                        <span className="size-1.5 rounded-full bg-border" aria-hidden />
                      )}
                    </span>
                  </div>
                  {s.stage === "simulating" && s.total !== null && s.total > 0 && (
                    <Progress
                      value={Math.min(100, (s.done / s.total) * 100)}
                      className="ml-7 h-1"
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          {/* Placeholder panel — workstream C's results view replaces this at integration. */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Synthesis
              </span>
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">
                Full results land at integration
              </span>
            </div>
            <div className="px-4 py-6">
              {status === "completed" && verdict ? (
                <div className="flex flex-col gap-3">
                  <Badge className={verdictBadgeClass(verdict)}>{VERDICT_LABELS[verdict]}</Badge>
                  {typeof (run.synthesis as { oneLiner?: unknown })?.oneLiner === "string" && (
                    <p className="max-w-prose text-lg font-medium text-balance">
                      {(run.synthesis as { oneLiner: string }).oneLiner}
                    </p>
                  )}
                </div>
              ) : status === "completed" ? (
                <p className="text-sm text-muted-foreground">
                  The run completed, but no synthesis was recorded.
                </p>
              ) : terminal ? (
                <p className="text-sm text-muted-foreground">
                  This run ended before a verdict — status: {STATUS_LABELS[status].toLowerCase()}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Results appear here when the run completes.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
