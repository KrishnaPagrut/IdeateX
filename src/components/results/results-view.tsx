import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MarketingReport } from "@/lib/schemas/report";
import type { AgentRunSnapshot, PersonaLite, RunSnapshot } from "@/components/run-live/types";

import { VerdictCard } from "./verdict-card";
import { StudyBrief } from "./study-brief";
import { RaceComparison } from "./race-comparison";
import { AdvisorPanel } from "./advisor-panel";
import { ScoreDistribution } from "./score-distribution";
import { ObjectionsList } from "./objections-list";
import { QuotesWall } from "./quotes-wall";
import { CampaignPackage } from "./campaign-package";
import { FocusGroup, hasFocusGroup } from "./focus-group";
import { ReportIndex, ReportSection, type ReportSectionDef } from "./report-section";

// ---------------------------------------------------------------------------
// The full campaign report, composed as one numbered document a founder reads
// top-to-bottom:
//
//   §01 Verdict     — the answer first; nobody should scroll for the verdict.
//   §02 Method      — how the answer was produced (brief, cohorts,
//                     assumptions), so the evidence is read with the study's
//                     blind spots in mind.
//   §03 The race    — how the strategies actually behaved against the same
//                     audience: scores, narratives, where reach landed.
//   §04 Advisors    — the deliberation that picked the winner, disagreements
//                     included, plus the directives that constrain the drafts.
//   §05 Deep swarm  — the full persona panel's evidence on the winner.
//   §06 Focus group — deliberation: what moved when personas heard peers.
//   §07 Voices      — the raw verbatim reactions, the report's source data.
//   §08 Campaign    — the deliverable: drafts, objection ledger, pre-mortem.
//   §09 Next        — close with actions, not analysis.
//
// The section list is built dynamically so absent stages drop out without
// leaving numbering gaps.
// ---------------------------------------------------------------------------

function Findings({ report }: { report: MarketingReport }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h4 className="text-sm font-medium">Key findings</h4>
      {/* min-w-0 on grid children is required: flex items default to
          min-width:auto, so long sourceRef badges otherwise spill into the
          neighboring column and paint on top of it. */}
      <ol className="mt-3 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {report.keyFindings.map((f, i) => (
          <li key={f.title} className="flex min-w-0 gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-2xs font-semibold text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-xs font-medium wrap-break-word">{f.title}</p>
              <p className="mt-0.5 text-2xs leading-relaxed wrap-break-word text-muted-foreground">
                {f.detail}
              </p>
              <Badge
                variant="outline"
                title={f.sourceRef}
                className="mt-1.5 max-w-full truncate text-3xs font-normal"
              >
                {f.sourceRef}
              </Badge>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NextMoves({
  report,
  onOpenLaunchKit,
}: {
  report: MarketingReport;
  onOpenLaunchKit?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-5">
        <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          Next steps
        </p>
        <ol className="mt-2 space-y-2">
          {report.nextSteps.map((step, i) => (
            <li key={step} className="flex min-w-0 items-start gap-2 text-xs leading-relaxed">
              <span className="mt-0.5 shrink-0 font-mono text-3xs font-semibold text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 wrap-break-word">{step}</span>
              <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
            </li>
          ))}
        </ol>
      </div>
      {onOpenLaunchKit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
          <div className="min-w-0">
            <p className="font-mono text-3xs tracking-eyebrow text-primary uppercase">Launch kit</p>
            <p className="mt-1 text-sm font-medium">Turn the winner into a dated campaign timeline</p>
            <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
              Teasers, launch day, follow-ups — copy and visuals you can edit.
            </p>
          </div>
          <Button size="sm" onClick={onOpenLaunchKit}>
            Open launch kit
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ResultsView({
  run,
  agents,
  personas,
  onSelectAgent,
  onOpenLaunchKit,
}: {
  run: RunSnapshot;
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
  /** Optional: quote/exchange cards open that agent in the inspector. */
  onSelectAgent?: (agentRunId: string) => void;
  /** Optional: jump from the report into the launch-kit tab. */
  onOpenLaunchKit?: () => void;
}) {
  const report = run.synthesis;
  const aggregates = run.aggregates;

  if (!report) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No report yet — results appear when the run completes.
        </p>
      </div>
    );
  }

  const strategies = run.strategies ?? [];
  const race = run.race ?? [];
  const advisorReport = run.advisorReport ?? null;
  const winnerId = advisorReport?.consensus.winnerStrategyId ?? null;
  const winner = strategies.find((s) => s.id === winnerId) ?? null;
  const winnerRace = race.find((r) => r.strategyId === winnerId) ?? null;

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
      sub: winner ? `winning strategy: ${winner.name}` : undefined,
      node: (
        <VerdictCard
          report={report}
          winnerName={winner?.name ?? null}
          winnerScores={winnerRace?.scores ?? null}
          aggregates={aggregates}
        />
      ),
    },
    ...(run.brief && "cohorts" in run.brief
      ? [
          {
            id: "method",
            label: "Method",
            title: "Study design",
            sub: `${run.brief.cohorts.length} cohorts · clarity ${Math.round(run.brief.clarityScore)}/100`,
            node: <StudyBrief brief={run.brief} />,
          },
        ]
      : []),
    ...(race.length > 0 && strategies.length > 0
      ? [
          {
            id: "race",
            label: "Race",
            title: "The strategy race",
            sub: `${strategies.length} strategies · same audience, identical conditions`,
            node: <RaceComparison strategies={strategies} race={race} winnerId={winnerId} />,
          },
        ]
      : []),
    ...(advisorReport
      ? [
          {
            id: "advisors",
            label: "Advisors",
            title: "The advisory panel",
            sub: `${advisorReport.verdicts.length} expert lenses argued; the moderator synthesized`,
            node: (
              <AdvisorPanel
                verdicts={advisorReport.verdicts}
                consensus={advisorReport.consensus}
                strategies={strategies}
              />
            ),
          },
        ]
      : []),
    {
      id: "evidence",
      label: "Evidence",
      title: "Deep swarm on the winner",
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
          <Findings report={report} />
        </div>
      ),
    },
    ...(hasFocusGroup(agents)
      ? [
          {
            id: "focus-group",
            label: "Focus group",
            title: "Focus group",
            sub: `${discussionCount} personas reconvened to hear their cohort peers`,
            node: <FocusGroup agents={agents} personas={personas} onSelect={onSelectAgent} />,
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
      id: "campaign",
      label: "Campaign",
      title: "The campaign package",
      sub: "every draft cites the finding it answers",
      node: <CampaignPackage report={report} />,
    },
    {
      id: "next",
      label: "Next",
      title: "What next",
      node: <NextMoves report={report} onOpenLaunchKit={onOpenLaunchKit} />,
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
