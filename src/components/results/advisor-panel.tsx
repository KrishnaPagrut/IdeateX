import { Gavel } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdvisorConsensus, AdvisorVerdict, CampaignStrategy } from "@/lib/schemas/marketing";

// ---------------------------------------------------------------------------
// The advisor deliberation: each expert lens's ranking and arguments, then
// the moderator's consensus — including where the panel genuinely disagreed,
// stated as-is rather than smoothed over.
// ---------------------------------------------------------------------------

function strategyName(id: string, strategies: CampaignStrategy[]): string {
  return strategies.find((s) => s.id === id)?.name ?? id;
}

export function AdvisorPanel({
  verdicts,
  consensus,
  strategies,
}: {
  verdicts: AdvisorVerdict[];
  consensus: AdvisorConsensus;
  strategies: CampaignStrategy[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {verdicts.map((v) => {
          const ranking = [...v.ranking].sort((a, b) => a.rank - b.rank);
          return (
            <div key={v.lens} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                {v.lens}
              </p>
              <ol className="space-y-2.5">
                {ranking.map((r) => (
                  <li key={r.strategyId} className="flex gap-2">
                    <span className="mt-0.5 font-mono text-2xs font-semibold text-muted-foreground">
                      {r.rank}.
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {strategyName(r.strategyId, strategies)}
                      </p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                        {r.argument}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {v.concerns.length > 0 && (
                <div className="border-t pt-2.5">
                  <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                    Concerns
                  </p>
                  <ul className="mt-1 space-y-1">
                    {v.concerns.map((c) => (
                      <li key={c} className="text-2xs leading-relaxed text-destructive/90">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-primary/30 bg-card p-5">
        <p className="flex items-center gap-1.5 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          <Gavel className="size-3.5" /> Moderator consensus
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          <span className="font-medium">
            {strategyName(consensus.winnerStrategyId, strategies)}
          </span>
          {" — "}
          {consensus.rationale}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {consensus.agreements.length > 0 && (
            <div>
              <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Where the panel agreed
              </p>
              <ul className="mt-1.5 space-y-1">
                {consensus.agreements.map((a) => (
                  <li key={a} className="text-2xs leading-relaxed text-foreground/85">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {consensus.disagreements.length > 0 && (
            <div>
              <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Unresolved tensions
              </p>
              <ul className="mt-1.5 space-y-1">
                {consensus.disagreements.map((d) => (
                  <li key={d} className="text-2xs leading-relaxed text-foreground/85">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 border-t pt-3">
          <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
            Directives · hard constraints on the campaign content
          </p>
          <ul className="mt-2 space-y-2">
            {consensus.directives.map((d) => (
              <li key={d.directive} className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-3xs uppercase">
                  must
                </Badge>
                <div>
                  <p className="text-xs font-medium">{d.directive}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                    {d.rationale}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
