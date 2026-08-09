import { ShieldAlert, Microscope } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Critique } from "@/lib/schemas/critique";
import type { AgentRunSnapshot } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Red-team panel: both critics side by side — findings with severity, bias
// warnings about the simulation itself, and each critic's adjusted confidence
// shown against the synthesis confidence.
// ---------------------------------------------------------------------------

const STANCE_META: Record<Critique["stance"], { title: string; sub: string; icon: typeof ShieldAlert }> = {
  methodology: {
    title: "Methodology review",
    sub: "attacks the study design",
    icon: Microscope,
  },
  redteam: {
    title: "Red team",
    sub: "attacks the idea and the conclusion",
    icon: ShieldAlert,
  },
};

function CritiqueCard({
  critique,
  synthesisConfidence,
}: {
  critique: Critique;
  synthesisConfidence?: number;
}) {
  const meta = STANCE_META[critique.stance];
  const Icon = meta.icon;
  const delta =
    synthesisConfidence !== undefined ? critique.adjustedConfidence - synthesisConfidence : null;

  return (
    <article className="flex flex-col rounded-xl border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-secondary">
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
          <div>
            <h4 className="text-sm font-medium">{meta.title}</h4>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              {meta.sub}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
            Adj. confidence
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {critique.adjustedConfidence}
            {delta !== null && (
              <span className="ml-1 text-[11px] font-normal text-destructive">
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-2.5">
        {critique.findings.map((f) => (
          <li key={f.claim} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs leading-snug font-medium">{f.claim}</p>
              <Badge
                variant={
                  f.severity === "high"
                    ? "destructive"
                    : f.severity === "medium"
                      ? "outline"
                      : "secondary"
                }
                className="shrink-0 font-mono text-[9px] tracking-widest uppercase"
              >
                {f.severity}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{f.evidence}</p>
          </li>
        ))}
      </ul>

      {critique.biasWarnings.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Bias warnings
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {critique.biasWarnings.map((w) => (
              <li key={w} className="flex gap-2 text-[11px] leading-relaxed text-foreground/85">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-destructive" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {critique.contraryEvidence.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Contrary evidence
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {critique.contraryEvidence.map((c) => (
              <li key={c} className="flex gap-2 text-[11px] leading-relaxed text-foreground/85">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function CritiquePanel({
  agents,
  synthesisConfidence,
}: {
  agents: AgentRunSnapshot[];
  synthesisConfidence?: number;
}) {
  const critiques = agents
    .filter((a) => a.kind === "critique" && a.status === "completed" && a.output != null)
    .map((a) => a.output as Critique);

  if (critiques.length === 0) return null;

  // Section chrome (title, counts) is owned by ResultsView's ReportSection so
  // the adversarial review reads as a first-class chapter, not an appendix.
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {critiques.map((c) => (
        <CritiqueCard key={c.stance} critique={c} synthesisConfidence={synthesisConfidence} />
      ))}
    </div>
  );
}
