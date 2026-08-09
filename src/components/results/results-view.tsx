import { ArrowRight, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Critique } from "@/lib/schemas/critique";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { AgentRunSnapshot, PersonaLite, RunSnapshot } from "@/components/run-live/types";

import { VerdictCard } from "./verdict-card";
import { StudyBrief } from "./study-brief";
import { ScoreDistribution } from "./score-distribution";
import { SegmentBreakdown } from "./segment-breakdown";
import { ObjectionsList } from "./objections-list";
import { QuotesWall } from "./quotes-wall";
import { CritiquePanel } from "./critique-panel";
import { FocusGroup, hasFocusGroup } from "./focus-group";
import { ReportIndex, ReportSection, type ReportSectionDef } from "./report-section";

// ---------------------------------------------------------------------------
// The full results report, composed as one numbered document a founder reads
// top-to-bottom:
//
//   §01 Verdict     — the answer first; nobody should scroll for the verdict.
//   §02 Method      — how the answer was produced (brief, segments,
//                     assumptions), so the evidence is read with the study's
//                     blind spots in mind. Answer → method → evidence mirrors
//                     how research reports earn trust.
//   §03 Evidence    — distribution, objections, segments, findings & risks.
//   §04 Focus group — deliberation: what moved when personas heard peers.
//   §05 Red team    — adversarial review challenges everything above it, so
//                     it comes after the evidence it attacks.
//   §06 Voices      — the raw verbatim reactions, the report's source data.
//   §07 Next        — close with actions, not analysis.
//
// The section list is built dynamically so absent stages (no brief, no
// discussion, no critics) drop out without leaving numbering gaps.
// ---------------------------------------------------------------------------

function FindingsAndRisks({ synthesis }: { synthesis: Synthesis }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-5">
        <h4 className="text-sm font-medium">Key findings</h4>
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
        <h4 className="text-sm font-medium">Top risks</h4>
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
    </div>
  );
}

function NextMoves({ synthesis }: { synthesis: Synthesis }) {
  return (
    <div className="rounded-xl border bg-card p-5">
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
    </div>
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
  /** Optional: quote/exchange cards open that agent in the inspector. */
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

  const critiques = agents.filter(
    (a) => a.kind === "critique" && a.status === "completed" && a.output != null,
  );
  const highSeverityFindings = critiques
    .map((a) => a.output as Critique)
    .reduce((n, c) => n + c.findings.filter((f) => f.severity === "high").length, 0);
  const quoteCount = agents.filter(
    (a) => a.kind === "persona" && a.status === "completed" && a.output != null,
  ).length;
  const discussionCount = agents.filter(
    (a) => a.kind === "discussion" && a.status === "completed" && a.output != null,
  ).length;

  const sections: ReportSectionDef[] = [
    {
      id: "verdict",
      label: "Verdict",
      title: "Verdict",
      sub: `synthesis of ${aggregates ? `${aggregates.completed} persona verdicts` : "the swarm"}`,
      node: <VerdictCard synthesis={synthesis} aggregates={aggregates} />,
    },
    ...(run.brief
      ? [
          {
            id: "method",
            label: "Method",
            title: "Study design",
            sub: `${run.brief.segments.length} segments · clarity ${Math.round(run.brief.clarityScore)}/100`,
            node: <StudyBrief brief={run.brief} />,
          },
        ]
      : []),
    {
      id: "evidence",
      label: "Evidence",
      title: "Evidence from the swarm",
      sub: aggregates
        ? `n = ${aggregates.completed}/${aggregates.personaCount} personas`
        : undefined,
      node: (
        <div className="space-y-3">
          {aggregates && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ScoreDistribution aggregates={aggregates} />
              <ObjectionsList aggregates={aggregates} />
            </div>
          )}
          <SegmentBreakdown synthesis={synthesis} aggregates={aggregates} />
          <FindingsAndRisks synthesis={synthesis} />
        </div>
      ),
    },
    ...(hasFocusGroup(agents)
      ? [
          {
            id: "focus-group",
            label: "Focus group",
            title: "Focus group",
            sub: `${discussionCount} personas reconvened to hear their segment peers`,
            node: <FocusGroup agents={agents} personas={personas} onSelect={onSelectAgent} />,
          },
        ]
      : []),
    ...(critiques.length > 0
      ? [
          {
            id: "red-team",
            label: "Red team",
            title: "Adversarial review",
            sub: `${critiques.length} critics attacked this study before synthesis${
              highSeverityFindings > 0 ? ` · ${highSeverityFindings} high-severity findings` : ""
            }`,
            node: <CritiquePanel agents={agents} synthesisConfidence={synthesis.confidence} />,
          },
        ]
      : []),
    ...(quoteCount > 0
      ? [
          {
            id: "voices",
            label: "Voices",
            title: "In their own words",
            sub: `${quoteCount} verbatim reactions · sorted by adoption`,
            node: <QuotesWall agents={agents} personas={personas} onSelect={onSelectAgent} />,
          },
        ]
      : []),
    {
      id: "next",
      label: "Next",
      title: "What next",
      node: <NextMoves synthesis={synthesis} />,
    },
  ];

  return (
    <div>
      <ReportIndex sections={sections} />
      <div className="mt-5 space-y-8">
        {sections.map((s, i) => (
          <ReportSection key={s.id} id={s.id} index={i + 1} title={s.title} sub={s.sub}>
            {s.node}
          </ReportSection>
        ))}
      </div>
    </div>
  );
}
