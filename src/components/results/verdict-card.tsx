import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { MarketingReport } from "@/lib/schemas/report";
import type { RunAggregates } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Hero verdict: the campaign's stamped conclusion. The stamp is the page's
// one loud element — everything else stays quiet and instrument-like.
// ---------------------------------------------------------------------------

const VERDICT_STYLE: Record<
  MarketingReport["verdict"],
  { label: string; className: string }
> = {
  launch_ready: { label: "Launch ready", className: "border-primary text-primary" },
  promising: { label: "Promising", className: "border-primary text-primary" },
  needs_work: { label: "Needs work", className: "border-foreground/60 text-foreground/80" },
  high_risk: { label: "High risk", className: "border-destructive text-destructive" },
};

function VerdictStamp({ verdict }: { verdict: MarketingReport["verdict"] }) {
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
      <span className="font-mono text-lg font-bold tracking-stamp uppercase sm:text-xl">
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
        <span className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
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
      <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">{label}</p>
      <p className="font-mono text-xs tabular-nums">{children}</p>
    </div>
  );
}

export function VerdictCard({
  report,
  winnerName,
  winnerScores,
  aggregates,
}: {
  report: MarketingReport;
  winnerName?: string | null;
  winnerScores?: { purchaseIntent: number; audienceFit: number; trust: number } | null;
  aggregates?: RunAggregates | null;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          {/* The section header above supplies the eyebrow; the stamp leads. */}
          <VerdictStamp verdict={report.verdict} />
          <p className="mt-5 font-serif text-xl leading-snug font-medium text-balance sm:text-2xl">
            {report.oneLiner}
          </p>
          {winnerName && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-3xs tracking-eyebrow uppercase">
                Winning strategy ·{" "}
              </span>
              <span className="font-medium text-foreground">{winnerName}</span>
              {" — "}
              {report.winnerRationale}
            </p>
          )}
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
          {winnerScores && (
            <>
              <ScoreBar label="Purchase intent" value={winnerScores.purchaseIntent} />
              <ScoreBar label="Audience fit" value={winnerScores.audienceFit} />
              <ScoreBar label="Trust" value={winnerScores.trust} />
            </>
          )}
          <div className={cn(winnerScores && "border-t pt-3")}>
            <ScoreBar label="Confidence" value={report.confidence} />
          </div>
        </div>
      </div>
    </section>
  );
}
