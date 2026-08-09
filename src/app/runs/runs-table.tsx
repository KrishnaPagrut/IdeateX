"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RunStatus, RunTier } from "@/lib/db/schema";
import {
  formatRelativeTime,
  formatUsd,
  STATUS_LABELS,
  statusBadgeClass,
  VERDICT_LABELS,
  verdictBadgeClass,
  type SynthesisVerdict,
} from "./format";

export interface RunRow {
  id: string;
  idea: string;
  tier: RunTier;
  status: RunStatus;
  verdict: SynthesisVerdict | null;
  costUsd: string | null;
  createdAt: string;
}

export function RunsTable({ rows }: { rows: RunRow[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Idea</TableHead>
            <TableHead className="w-24">Tier</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-36">Verdict</TableHead>
            <TableHead className="w-20 text-right">Cost</TableHead>
            <TableHead className="w-28 text-right">Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((run) => (
            <TableRow
              key={run.id}
              onClick={() => router.push(`/runs/${run.id}`)}
              className="cursor-pointer"
            >
              <TableCell className="max-w-0 sm:max-w-md">
                <span className="block truncate font-medium" title={run.idea}>
                  {run.idea}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
                  {run.tier}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={statusBadgeClass(run.status)}>
                  {STATUS_LABELS[run.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {run.status === "completed" && run.verdict ? (
                  <Badge className={verdictBadgeClass(run.verdict)}>
                    {VERDICT_LABELS[run.verdict]}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {formatUsd(run.costUsd) ?? "—"}
              </TableCell>
              <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                {formatRelativeTime(run.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
