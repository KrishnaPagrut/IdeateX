import type { RunAggregates } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Ranked objection frequency: horizontal bars, single hue, count labeled at
// the bar end (magnitude is the job — sequential, no categorical palette).
// ---------------------------------------------------------------------------

export function ObjectionsList({ aggregates }: { aggregates: RunAggregates }) {
  const items = [...aggregates.objectionFrequency].sort((a, b) => b.count - a.count);
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <section className="rounded-xl border bg-card p-5">
      <header>
        <h3 className="text-sm font-medium">Top objections</h3>
        <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          mentions across {aggregates.completed} personas
        </p>
      </header>
      <ol className="mt-4 space-y-3">
        {items.map((item, rank) => (
          <li key={item.objection}>
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 text-xs leading-snug wrap-break-word text-foreground/90">
                <span className="mr-1.5 font-mono text-3xs text-muted-foreground">
                  {String(rank + 1).padStart(2, "0")}
                </span>
                {item.objection}
              </span>
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                {item.count}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary/15">
              <div
                className="h-full rounded-r-full bg-primary"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
