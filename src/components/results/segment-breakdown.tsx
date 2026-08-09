import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { RunAggregates } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Segment table: one row per studied segment — sample size, mean adoption
// (number + inline meter), stance, and the segment's most telling quote.
// ---------------------------------------------------------------------------

export function SegmentBreakdown({
  synthesis,
  aggregates,
}: {
  synthesis: Synthesis;
  aggregates?: RunAggregates | null;
}) {
  const nBySegment = new Map(
    (aggregates?.segmentStats ?? []).map((s) => [s.segment, s.n]),
  );

  return (
    <section className="rounded-xl border bg-card p-5">
      <header>
        <h3 className="text-sm font-medium">Segment breakdown</h3>
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {synthesis.segmentSummaries.length} segments studied
        </p>
      </header>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-mono text-[10px] tracking-widest uppercase">Segment</TableHead>
              <TableHead className="w-10 text-right font-mono text-[10px] tracking-widest uppercase">n</TableHead>
              <TableHead className="w-40 font-mono text-[10px] tracking-widest uppercase">Mean adoption</TableHead>
              <TableHead className="font-mono text-[10px] tracking-widest uppercase">Stance</TableHead>
              <TableHead className="min-w-56 font-mono text-[10px] tracking-widest uppercase">Notable quote</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {synthesis.segmentSummaries.map((s) => (
              <TableRow key={s.segment}>
                <TableCell className="align-top text-xs font-medium whitespace-normal">
                  {s.segment}
                </TableCell>
                <TableCell className="text-right align-top font-mono text-xs tabular-nums text-muted-foreground">
                  {nBySegment.get(s.segment) ?? "—"}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center gap-2">
                    <span className="w-9 font-mono text-xs font-semibold tabular-nums">
                      {s.meanAdoption}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${s.meanAdoption}%` }}
                      />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-48 align-top text-xs whitespace-normal text-foreground/90">
                  {s.stance}
                </TableCell>
                <TableCell className="align-top text-xs whitespace-normal text-muted-foreground italic">
                  &ldquo;{s.notableQuote}&rdquo;
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
