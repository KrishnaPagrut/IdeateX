import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";

import { db, runs } from "@/lib/db";
import { verdictFromSynthesis } from "./format";
import { RunsTable, type RunRow } from "./runs-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage() {
  const rows = await db.select().from(runs).orderBy(desc(runs.createdAt));

  const tableRows: RunRow[] = rows.map((run) => ({
    id: run.id,
    idea: run.idea,
    tier: run.tier,
    status: run.status,
    verdict: verdictFromSynthesis(run.synthesis),
    costUsd: run.actualCostUsd ?? run.estCostUsd,
    createdAt: run.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-14">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">Run history</p>
        <h1 className="text-3xl font-semibold tracking-tight">Runs</h1>
      </header>
      <div className="mt-8">
        {tableRows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-card p-8">
            <p className="font-medium">No runs yet.</p>
            <p className="text-sm text-muted-foreground">
              Launch your first from{" "}
              <Link href="/" className="text-primary underline underline-offset-4">
                New run
              </Link>{" "}
              — the swarm takes it from there.
            </p>
          </div>
        ) : (
          <RunsTable rows={tableRows} />
        )}
      </div>
    </div>
  );
}
