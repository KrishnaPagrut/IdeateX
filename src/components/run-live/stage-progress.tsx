"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import type { AgentKind, RunStatus } from "@/lib/db/schema";
import type { AgentLite } from "./types";

// ---------------------------------------------------------------------------
// Horizontal five-stage tracker. Pure props: run status + agent list in,
// pipeline position out. Counts are derived per stage from the agents of the
// matching kind (e.g. simulating 18/24).
// ---------------------------------------------------------------------------

const ALL_STAGES = [
  { stage: "framing", kind: "framing", label: "Framing" },
  { stage: "planning", kind: "planner", label: "Planning" },
  { stage: "simulating", kind: "persona", label: "Simulating" },
  { stage: "discussing", kind: "discussion", label: "Focus group" },
  { stage: "critiquing", kind: "critique", label: "Critiquing" },
  { stage: "synthesizing", kind: "synthesis", label: "Synthesizing" },
] as const satisfies ReadonlyArray<{ stage: string; kind: AgentKind; label: string }>;

type StageDef = (typeof ALL_STAGES)[number];
type StageState = "pending" | "active" | "done" | "failed";

/** The focus-group stage only shows for runs that have (or are in) one. */
function visibleStages(status: RunStatus, agents: AgentLite[]): StageDef[] {
  const hasDiscussion = status === "discussing" || agents.some((a) => a.kind === "discussion");
  return hasDiscussion ? [...ALL_STAGES] : ALL_STAGES.filter((s) => s.stage !== "discussing");
}

function activeStageIndex(stages: StageDef[], status: RunStatus, agents: AgentLite[]): number {
  const idx = stages.findIndex((s) => s.stage === status);
  if (idx >= 0) return idx;
  if (status === "completed") return stages.length;
  if (status === "pending") return -1;
  // failed / cancelled / stale: freeze at the furthest stage that has agents.
  for (let i = stages.length - 1; i >= 0; i--) {
    if (agents.some((a) => a.kind === stages[i].kind)) return i;
  }
  return -1;
}

const DOT_STYLE = { "--color-dot-on": "var(--primary-foreground)" } as CSSProperties;

export function StageProgress({
  status,
  agents,
  className,
}: {
  status: RunStatus;
  agents: AgentLite[];
  className?: string;
}) {
  const stages = visibleStages(status, agents);
  const active = activeStageIndex(stages, status, agents);
  const runFailed = status === "failed" || status === "cancelled" || status === "stale";

  return (
    <ol className={cn("flex items-center", className)} aria-label="Run pipeline progress">
      {stages.map((s, i) => {
        const stageAgents = agents.filter((a) => a.kind === s.kind);
        const done = stageAgents.filter(
          (a) => a.status === "completed" || a.status === "failed" || a.status === "skipped",
        ).length;
        const failedCount = stageAgents.filter((a) => a.status === "failed").length;
        const total = stageAgents.length;

        let state: StageState = "pending";
        if (i < active) state = "done";
        else if (i === active) state = runFailed ? "failed" : "active";
        if (active >= stages.length) state = "done";

        return (
          <li key={s.stage} className="flex min-w-0 items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 h-px w-5 sm:w-9",
                  i <= active ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span className="flex items-center gap-1.5" aria-current={state === "active" ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary bg-primary text-primary-foreground",
                  state === "failed" && "border-destructive bg-destructive/10 text-destructive",
                  state === "pending" && "border-border bg-transparent text-muted-foreground",
                )}
                style={DOT_STYLE}
              >
                {state === "done" ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : state === "active" ? (
                  <DotmSquare3 size={12} dotSize={1.5} colorPreset="solid-theme" ariaLabel={`${s.label} in progress`} />
                ) : (
                  <span className="font-mono text-[9px] leading-none">{i + 1}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate font-mono text-[10px] tracking-widest uppercase",
                    state === "pending" ? "text-muted-foreground/60" : "text-foreground",
                    state === "failed" && "text-destructive",
                  )}
                >
                  {s.label}
                </span>
                {total > 0 && (
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {done}/{total}
                    {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
                  </span>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
