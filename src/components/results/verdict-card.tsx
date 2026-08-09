import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { RunAggregates } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Hero verdict: the study's stamped conclusion. The stamp is the page's one
// loud element — everything else stays quiet and instrument-like.
// ---------------------------------------------------------------------------

const VERDICT_STYLE: Record<
  Synthesis["verdict"],
  { label: string; className: string }
> = {
  strong_signal: { label: "Strong signal", className: "border-primary text-primary" },
  promising: { label: "Promising", className: "border-primary text-primary" },
  mixed: { label: "Mixed", className: "border-foreground/60 text-foreground/80" },
  weak: { label: "Weak", className: "border-destructive/70 text-destructive" },
  dead_on_arrival: { label: "Dead on arrival", className: "border-destructive text-destructive" },
};

function VerdictStamp({ verdict }: { verdict: Synthesis["verdict"] }) {
  const v = VERDICT_STYLE[verdict];
  return (
    <div
      aria-label={`Verdict: ${v.label}`}
      className={cn(
        "inline-block -rotate-3 rounded-md border-2 px-4 py-1.5 select-none",
        "shadow-[inset_0_0_0_2px_var(--background),inset_0_0_0_3px_currentColor]",
        v.className,
      )}
    >
      <span className="font-mono text-lg font-bold tracking-[0.2em] uppercase sm:text-xl">
        {v.label}
      </span>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums">{rounded}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary" style={{ width: `${rounded}%` }} />
      </div>
    </div>
  );
}

function MetaStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="font-mono text-xs tabular-nums">{children}</p>
    </div>
  );
}

export function VerdictCard({
  synthesis,
  aggregates,
}: {
  synthesis: Synthesis;
  aggregates?: RunAggregates | null;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          {/* The section header above supplies the eyebrow; the stamp leads. */}
          <VerdictStamp verdict={synthesis.verdict} />
          <p className="mt-5 text-lg leading-snug font-medium text-balance sm:text-xl">
            {synthesis.oneLiner}
          </p>
          {aggregates && (
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              <MetaStat label="Personas">
                {aggregates.completed}/{aggregates.personaCount}
                {aggregates.failed > 0 && (
                  <span className="text-destructive"> · {aggregates.failed} failed</span>
                )}
              </MetaStat>
              <MetaStat label="Mean adoption">{aggregates.meanAdoption}/100</MetaStat>
              <MetaStat label="Would recommend">{aggregates.recommendRate}%</MetaStat>
              {aggregates.meanWillingnessToPay && (
                <MetaStat label="Mean WTP">
                  ${aggregates.meanWillingnessToPay.amount}/{aggregates.meanWillingnessToPay.cadence === "monthly" ? "mo" : aggregates.meanWillingnessToPay.cadence}
                </MetaStat>
              )}
            </div>
          )}
        </div>
        <div className="w-full shrink-0 space-y-3.5 lg:w-64">
          <ScoreBar label="Desirability" value={synthesis.scores.desirability} />
          <ScoreBar label="Viability" value={synthesis.scores.viability} />
          <ScoreBar label="Urgency" value={synthesis.scores.urgency} />
          <div className="border-t pt-3">
            <ScoreBar label="Confidence" value={synthesis.confidence} />
          </div>
        </div>
      </div>
    </section>
  );
}
