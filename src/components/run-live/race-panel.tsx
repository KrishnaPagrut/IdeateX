"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { StrategyScores } from "@/lib/schemas/marketing";
import type { RaceStrategyState } from "@/lib/hooks/use-run-stream";

// ---------------------------------------------------------------------------
// Live race panel: one column per strategy while the sims run. Each column
// shows tick progress, a dot per audience member lighting up as reach spreads
// (activation order), the eight comparative scores, and the narratives
// currently carrying momentum.
// ---------------------------------------------------------------------------

const SCORE_ROWS: Array<{ key: keyof StrategyScores; label: string; inverted?: boolean }> = [
  { key: "reach", label: "Reach" },
  { key: "trust", label: "Trust" },
  { key: "messageComprehension", label: "Comprehension" },
  { key: "purchaseIntent", label: "Purchase intent" },
  { key: "sharePropensity", label: "Share propensity" },
  { key: "audienceFit", label: "Audience fit" },
  { key: "controversy", label: "Controversy", inverted: true },
  { key: "brandSafetyRisk", label: "Safety risk", inverted: true },
];

function DotGrid({ total, lit }: { total: number; lit: number }) {
  const dots = Array.from({ length: total }, (_, i) => i < lit);
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${lit} of ${total} personas reached`}>
      {dots.map((on, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full transition-colors duration-500",
            on ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  inverted,
}: {
  label: string;
  value: number;
  inverted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate font-mono text-3xs tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700",
            inverted ? "bg-destructive/70" : "bg-primary",
          )}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-right font-mono text-3xs tabular-nums text-foreground">
        {Math.round(value)}
      </span>
    </div>
  );
}

export function RacePanel({
  race,
  className,
}: {
  race: Record<string, RaceStrategyState>;
  className?: string;
}) {
  const columns = Object.values(race).sort((a, b) => a.strategyId.localeCompare(b.strategyId));
  if (columns.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="Strategy race">
      <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
        Strategy race · same audience, identical conditions · comparative scores, not forecasts
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((s) => (
          <div key={s.strategyId} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium" title={s.strategyName}>
                {s.strategyName}
              </span>
              <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
                {s.finished ? "final" : `t${s.tick}/${s.totalTicks}`}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-3xs tabular-nums text-muted-foreground">
                reached {s.reachedCount}/{s.personaCount}
              </span>
              <DotGrid total={s.personaCount} lit={s.activatedPersonaIds.length} />
            </div>

            <div className="flex flex-col gap-1.5">
              {SCORE_ROWS.map((row) => (
                <ScoreBar
                  key={row.key}
                  label={row.label}
                  value={s.scores[row.key]}
                  inverted={row.inverted}
                />
              ))}
            </div>

            {s.topNarratives.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.topNarratives.map((n) => (
                  <span
                    key={n.id}
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-3xs",
                      n.sentiment >= 0
                        ? "border-primary/40 text-primary"
                        : "border-destructive/40 text-destructive",
                    )}
                    title={`momentum ${n.momentum.toFixed(1)}`}
                  >
                    {n.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
