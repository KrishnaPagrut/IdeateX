"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import rawFixture from "@/fixtures/run-fixture.json";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toRunAggregates } from "@/components/run-live/adapt";
import { AgentGraph } from "@/components/run-live/agent-graph";
import { AgentDrawer } from "@/components/run-live/agent-drawer";
import { StageProgress } from "@/components/run-live/stage-progress";
import { ResultsView } from "@/components/results/results-view";
import type { AgentRunSnapshot, RunFixture, RunSnapshot } from "@/components/run-live/types";
import type { RunStatus } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Dev harness: renders the completed-run fixture through the real components,
// with a "simulate live" replay that streams the swarm in over ~17s to
// exercise pending/running states in the graph, stage tracker, and drawer.
// ---------------------------------------------------------------------------

const FIXTURE = rawFixture as unknown as RunFixture;

interface Slot {
  start: number; // seconds into replay when the agent starts running
  end: number; // seconds when it reaches its final status
}

const STAGE_BOUNDS: Array<{ status: RunStatus; until: number }> = [
  { status: "framing", until: 2.0 },
  { status: "planning", until: 4.4 },
  { status: "simulating", until: 10.6 },
  { status: "discussing", until: 13.6 },
  { status: "critiquing", until: 15.2 },
  { status: "synthesizing", until: 17.2 },
];
const REPLAY_TOTAL = 17.2;

function buildSchedule(agents: AgentRunSnapshot[]): Map<string, Slot> {
  const schedule = new Map<string, Slot>();
  let personaIdx = 0;
  let plannerIdx = 0;
  let discussionIdx = 0;
  let critiqueIdx = 0;
  for (const a of agents) {
    switch (a.kind) {
      case "framing":
        schedule.set(a.id, { start: 0.2, end: 2.0 });
        break;
      case "planner":
        schedule.set(a.id, { start: 2.2 + plannerIdx * 0.2, end: 4.2 + plannerIdx * 0.1 });
        plannerIdx++;
        break;
      case "persona": {
        const start = 4.6 + personaIdx * 0.2;
        schedule.set(a.id, { start, end: start + 1.4 + (personaIdx % 4) * 0.3 });
        personaIdx++;
        break;
      }
      case "discussion": {
        const start = 10.7 + discussionIdx * 0.12;
        schedule.set(a.id, { start, end: start + 1.2 + (discussionIdx % 3) * 0.3 });
        discussionIdx++;
        break;
      }
      case "critique":
        schedule.set(a.id, { start: 13.7 + critiqueIdx * 0.3, end: 15.0 + critiqueIdx * 0.2 });
        critiqueIdx++;
        break;
      case "synthesis":
        schedule.set(a.id, { start: 15.4, end: 17.2 });
        break;
    }
  }
  return schedule;
}

/** Project a final agent row into its state at `t` seconds of replay. */
function agentAt(a: AgentRunSnapshot, slot: Slot, t: number): AgentRunSnapshot | null {
  if (t < slot.start - 0.6) return null; // not yet revealed
  if (t < slot.start) {
    return { ...a, status: "pending", output: null, rawText: null, error: null, startedAt: null, finishedAt: null, inputTokens: null, outputTokens: null, costUsd: null };
  }
  if (t < slot.end) {
    return { ...a, status: "running", output: null, rawText: null, error: null, finishedAt: null, inputTokens: null, outputTokens: null, costUsd: null };
  }
  return a;
}

export default function FixtureHarnessPage() {
  const [replaying, setReplaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState("swarm");
  const startRef = useRef<number>(0);

  // Dev conveniences: ?tab=results, ?replay=1, ?select=<kind|label> deep-link
  // the harness into a specific state (also used for headless screenshots).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // One-time sync from the URL (an external system) into state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get("tab") === "results") setTab("results");
    if (params.get("replay") === "1") setReplaying(true);
    const select = params.get("select");
    if (select) {
      const match = FIXTURE.agents.find(
        (a) => a.kind === select || a.label.toLowerCase().includes(select.toLowerCase()),
      );
      if (match) setSelectedId(match.id);
    }
  }, []);

  useEffect(() => {
    if (!replaying) return;
    startRef.current = performance.now();
    const interval = setInterval(() => {
      const t = (performance.now() - startRef.current) / 1000;
      setElapsed(t);
      if (t > REPLAY_TOTAL + 0.5) clearInterval(interval);
    }, 150);
    return () => clearInterval(interval);
  }, [replaying]);

  const schedule = useMemo(() => buildSchedule(FIXTURE.agents), []);

  const live = replaying && elapsed <= REPLAY_TOTAL;

  const agents = useMemo<AgentRunSnapshot[]>(() => {
    if (!live) return FIXTURE.agents;
    return FIXTURE.agents
      .map((a) => {
        const slot = schedule.get(a.id);
        return slot ? agentAt(a, slot, elapsed) : a;
      })
      .filter((a): a is AgentRunSnapshot => a !== null);
  }, [live, elapsed, schedule]);

  const runStatus: RunStatus = useMemo(() => {
    if (!live) return FIXTURE.run.status;
    return STAGE_BOUNDS.find((s) => elapsed < s.until)?.status ?? "completed";
  }, [live, elapsed]);

  const run = useMemo<RunSnapshot>(() => {
    // Regenerated fixtures carry engine-shaped aggregates (the snapshot API's
    // raw run row); adapt to the wire shape exactly like the live page does.
    const adapted = {
      ...FIXTURE.run,
      aggregates: toRunAggregates(FIXTURE.run.aggregates, FIXTURE.agents),
    };
    if (!live) return adapted;
    // While replaying, the synthesis hasn't "happened" yet.
    return { ...adapted, status: runStatus, synthesis: null, aggregates: null, finishedAt: null };
  }, [live, runStatus]);

  const selectedAgent = selectedId ? (agents.find((a) => a.id === selectedId) ?? null) : null;
  const selectedPersona = selectedAgent?.personaId
    ? (FIXTURE.personas[selectedAgent.personaId] ?? null)
    : null;

  const durationSec = FIXTURE.run.startedAt && FIXTURE.run.finishedAt
    ? Math.round((Date.parse(FIXTURE.run.finishedAt) - Date.parse(FIXTURE.run.startedAt)) / 1000)
    : null;

  return (
    <div className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
            IdeateX · dev fixture harness · run {FIXTURE.run.id.slice(0, 8)}
          </p>
          <h1 className="mt-1 truncate font-serif text-lg font-bold tracking-tight sm:text-xl" title={FIXTURE.run.idea}>
            {FIXTURE.run.idea}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-3xs uppercase">
              {FIXTURE.run.tier}
            </Badge>
            <Badge
              variant={runStatus === "completed" ? "secondary" : "outline"}
              className="font-mono text-3xs uppercase"
            >
              {runStatus}
            </Badge>
            {FIXTURE.run.actualCostUsd && (
              <Badge variant="ghost" className="font-mono text-3xs tabular-nums">
                ${Number(FIXTURE.run.actualCostUsd).toFixed(2)}
              </Badge>
            )}
            {durationSec !== null && (
              <Badge variant="ghost" className="font-mono text-3xs tabular-nums">
                {Math.floor(durationSec / 60)}m {durationSec % 60}s
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="simulate-live"
            checked={replaying}
            onCheckedChange={(checked) => {
              setReplaying(checked === true);
              setElapsed(0);
              setSelectedId(null);
            }}
          />
          <Label htmlFor="simulate-live" className="text-xs text-muted-foreground">
            Simulate live
          </Label>
        </div>
      </header>

      <div className="mt-5 overflow-x-auto rounded-xl border bg-card px-4 py-3">
        <StageProgress status={runStatus} agents={agents} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="mt-4">
        <TabsList>
          <TabsTrigger value="swarm">Swarm</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="swarm">
          <div className="relative h-[calc(100dvh-300px)] min-h-[480px] overflow-hidden border-y">
            <AgentGraph
              agents={agents}
              personas={FIXTURE.personas}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          </div>
        </TabsContent>

        <TabsContent value="results">
          <ResultsView
            run={run}
            agents={agents}
            personas={FIXTURE.personas}
            onSelectAgent={setSelectedId}
          />
        </TabsContent>
      </Tabs>

      <AgentDrawer
        agent={selectedAgent}
        persona={selectedPersona}
        personas={FIXTURE.personas}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
