import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db, personas } from "@/lib/db";
import { GeneratedPersonaSchema } from "@/lib/schemas/persona-gen";

/**
 * GET /api/personas — list active personas, newest first.
 * Query params: archetype, tag, q (name/occupation search), incomeBand,
 * domain, subdomain (pool filters — combine for one pool).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const archetype = params.get("archetype");
  const tag = params.get("tag");
  const q = params.get("q");
  const incomeBand = params.get("incomeBand");
  const domain = params.get("domain");
  const subdomain = params.get("subdomain");

  const conditions: SQL[] = [eq(personas.active, true)];
  if (domain) conditions.push(eq(personas.domain, domain));
  if (subdomain) conditions.push(eq(personas.subdomain, subdomain));
  if (archetype) conditions.push(eq(personas.archetype, archetype));
  if (tag) conditions.push(sql`${tag} = ANY(${personas.tags})`);
  if (incomeBand) {
    conditions.push(sql`${personas.demographics}->>'incomeBand' = ${incomeBand}`);
  }
  if (q) {
    const pattern = `%${q}%`;
    const nameOrOccupation = or(
      ilike(personas.name, pattern),
      sql`${personas.demographics}->>'occupation' ilike ${pattern}`,
    );
    if (nameOrOccupation) conditions.push(nameOrOccupation);
  }

  const rows = await db
    .select()
    .from(personas)
    .where(and(...conditions))
    .orderBy(desc(personas.createdAt));

  return NextResponse.json({ personas: rows });
}

/**
 * POST /api/personas — create a persona by hand (source 'edited').
 * Body: GeneratedPersonaSchema shape.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = GeneratedPersonaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid persona", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(personas)
    .values({
      ...parsed.data,
      avatarSeed: nanoid(),
      source: "edited",
    })
    .returning();

  return NextResponse.json({ persona: row }, { status: 201 });
}
