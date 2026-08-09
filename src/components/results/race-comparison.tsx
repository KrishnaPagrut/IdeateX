import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CampaignStrategy, RaceResult, StrategyScores } from "@/lib/schemas/marketing";

// ---------------------------------------------------------------------------
// The race, settled: eight comparative scores across all strategies with the
// winner's column highlighted, then each strategy's narratives — what the
// synthetic audience actually started saying under identical conditions.
// ---------------------------------------------------------------------------

const SCORE_ROWS: Array<{ key: keyof StrategyScores; label: string; lowerBetter?: boolean }> = [
  { key: "reach", label: "Reach" },
  { key: "trust", label: "Trust" },
  { key: "messageComprehension", label: "Comprehension" },
  { key: "purchaseIntent", label: "Purchase intent" },
  { key: "sharePropensity", label: "Share propensity" },
  { key: "audienceFit", label: "Audience fit" },
  { key: "controversy", label: "Controversy", lowerBetter: true },
  { key: "brandSafetyRisk", label: "Safety risk", lowerBetter: true },
];

export function RaceComparison({
  strategies,
  race,
  winnerId,
}: {
  strategies: CampaignStrategy[];
  race: RaceResult[];
  winnerId: string | null;
}) {
  const byId = new Map(race.map((r) => [r.strategyId, r]));
  const ordered = strategies.filter((s) => byId.has(s.id));
  if (ordered.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="p-3 text-left font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Score · comparative, not a forecast
              </th>
              {ordered.map((s) => (
                <th
                  key={s.id}
                  className={cn(
                    "p-3 text-right align-top",
                    s.id === winnerId && "bg-primary/5",
                  )}
                >
                  <span className="flex items-center justify-end gap-1.5 font-medium">
                    {s.id === winnerId && <Trophy className="size-3 text-primary" />}
                    {s.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-3xs tracking-wider text-muted-foreground uppercase">
                    {s.theme.replaceAll("_", " ")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORE_ROWS.map((row) => {
              const values = ordered.map((s) => byId.get(s.id)!.scores[row.key]);
              const best = row.lowerBetter ? Math.min(...values) : Math.max(...values);
              return (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="p-3 font-mono text-3xs tracking-wider text-muted-foreground uppercase">
                    {row.label}
                    {row.lowerBetter && <span className="normal-case"> (lower is better)</span>}
                  </td>
                  {ordered.map((s, i) => (
                    <td
                      key={s.id}
                      className={cn(
                        "p-3 text-right font-mono tabular-nums",
                        s.id === winnerId && "bg-primary/5",
                        values[i] === best ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {values[i]}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td className="p-3 font-mono text-3xs tracking-wider text-muted-foreground uppercase">
                Reach (n)
              </td>
              {ordered.map((s) => {
                const r = byId.get(s.id)!;
                return (
                  <td
                    key={s.id}
                    className={cn(
                      "p-3 text-right font-mono tabular-nums text-muted-foreground",
                      s.id === winnerId && "bg-primary/5",
                    )}
                  >
                    {r.reachedCount}/{r.personaCount}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {ordered.map((s) => {
          const r = byId.get(s.id)!;
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border bg-card p-4",
                s.id === winnerId && "border-primary/40",
              )}
            >
              <p className="text-xs font-medium">{s.name}</p>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                {s.positioningThesis}
              </p>
              <p className="mt-2 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                Narratives that formed
              </p>
              {r.narratives.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {r.narratives.map((n) => (
                    <li key={n.id} className="flex items-baseline justify-between gap-2 text-2xs">
                      <span
                        className={cn(
                          n.sentiment >= 0 ? "text-foreground/85" : "text-destructive",
                        )}
                      >
                        {n.label}
                      </span>
                      <span className="font-mono text-3xs tabular-nums text-muted-foreground">
                        ×{n.momentum.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-2xs text-muted-foreground">
                  None survived to the end of the run.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
