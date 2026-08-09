import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db/engine imported lazily inside the handler — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/cancel">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const [{ db, runs }, { cancelRun }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/engine/orchestrator"),
  ]);

  const cancelled = cancelRun(runId);
  if (cancelled) {
    await db
      .update(runs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(eq(runs.id, runId));
  }

  return Response.json({ cancelled });
}
