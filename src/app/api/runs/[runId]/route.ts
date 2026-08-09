import { asc, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db imported lazily inside the handler — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const { db, runs, agentRuns, personas } = await import("@/lib/db");

  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const agents = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.runId, runId))
    .orderBy(asc(agentRuns.createdAt));

  const personaIds = [
    ...new Set(agents.map((a) => a.personaId).filter((id): id is string => id !== null)),
  ];

  const personaRows = personaIds.length
    ? await db
        .select({
          id: personas.id,
          name: personas.name,
          archetype: personas.archetype,
          avatarSeed: personas.avatarSeed,
        })
        .from(personas)
        .where(inArray(personas.id, personaIds))
    : [];

  return Response.json({
    run,
    agents,
    personas: Object.fromEntries(personaRows.map((p) => [p.id, p])),
  });
}
