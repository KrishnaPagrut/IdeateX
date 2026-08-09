import { ArrowRight, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { AgentRunSnapshot, PersonaLite, RunSnapshot } from "@/components/run-live/types";

import { VerdictCard } from "./verdict-card";
import { ScoreDistribution } from "./score-distribution";
import { SegmentBreakdown } from "./segment-breakdown";
import { ObjectionsList } from "./objections-list";
import { QuotesWall } from "./quotes-wall";
import { CritiquePanel } from "./critique-panel";

// ---------------------------------------------------------------------------
// The full results report: verdict hero, then dense scannable instruments.
// Never a wall of text — every synthesis field gets a designed slot.
// ---------------------------------------------------------------------------

function FindingsAndRisks({ synthesis }: { synthesis: Synthesis }) {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium">Key findings</h3>
        <ol className="mt-3 space-y-3">
          {synthesis.keyFindings.map((f, i) => (
            <li key={f.title} className="flex gap-3">
              <span className="mt-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-xs font-medium">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{f.detail}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.supportingSegments.map((s) => (
                    <Badge key={s} variant="outline" className="text-[9px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium">Top risks</h3>
        <ul className="mt-3 space-y-3">
          {synthesis.topRisks.map((r) => (
            <li key={r.risk}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-snug font-medium">{r.risk}</p>
                <Badge
                  variant={
                    r.severity === "high"
                      ? "destructive"
                      : r.severity === "medium"
                        ? "outline"
                        : "secondary"
                  }
                  className="shrink-0 font-mono text-[9px] tracking-widest uppercase"
                >
                  {r.severity}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-mono text-[9px] tracking-widest uppercase">Mitigation · </span>
                {r.mitigation}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function NextMoves({ synthesis }: { synthesis: Synthesis }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-primary/25 bg-secondary/40 p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            <Lightbulb className="size-3.5" /> Boldest bet
          </p>
          <p className="mt-2 text-sm leading-relaxed font-medium">{synthesis.boldestBet}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Next steps
          </p>
          <ol className="mt-2 space-y-2">
            {synthesis.nextSteps.map((step, i) => (
              <li key={step} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="mt-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">{step}</span>
                <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function ResultsView({
  run,
  agents,
  personas,
  onSelectAgent,
}: {
  run: RunSnapshot;
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
  /** Optional: quote cards open the persona agent in the inspector. */
  onSelectAgent?: (agentRunId: string) => void;
}) {
  const synthesis = run.synthesis;
  const aggregates = run.aggregates;

  if (!synthesis) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No synthesis yet — results appear when the run completes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VerdictCard synthesis={synthesis} aggregates={aggregates} />
      {aggregates && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ScoreDistribution aggregates={aggregates} />
          <ObjectionsList aggregates={aggregates} />
        </div>
      )}
      <SegmentBreakdown synthesis={synthesis} aggregates={aggregates} />
      <FindingsAndRisks synthesis={synthesis} />
      <NextMoves synthesis={synthesis} />
      <CritiquePanel agents={agents} synthesisConfidence={synthesis.confidence} />
      <QuotesWall agents={agents} personas={personas} onSelect={onSelectAgent} />
    </div>
  );
}
