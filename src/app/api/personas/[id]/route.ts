import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, personas } from "@/lib/db";
import { GeneratedPersonaSchema } from "@/lib/schemas/persona-gen";

/** Partial update body: any subset of the generated-persona fields. Nested
 * objects (demographics/psychographics), when present, must be complete. */
const PersonaPatchSchema = GeneratedPersonaSchema.partial();

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/personas/[id]">) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(personas).where(eq(personas.id, id));
  if (!row) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  return NextResponse.json({ persona: row });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/personas/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PersonaPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid patch", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [row] = await db
    .update(personas)
    .set({ ...parsed.data, source: "edited", updatedAt: new Date() })
    .where(eq(personas.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  return NextResponse.json({ persona: row });
}

/** Soft delete: mark inactive so past runs keep their persona references. */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/personas/[id]">) {
  const { id } = await ctx.params;
  const [row] = await db
    .update(personas)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(personas.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  return NextResponse.json({ persona: row });
}
