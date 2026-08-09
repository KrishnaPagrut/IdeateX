import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, personas } from "@/lib/db";
import { generate } from "@/lib/llm/client";
import {
  buildBackstoryRegenPrompt,
  PERSONA_GEN_SYSTEM,
  RegeneratedBackstorySchema,
} from "@/lib/prompts/persona-gen";

/**
 * POST /api/personas/[id]/regenerate-backstory — regenerates JUST the
 * backstory (demographics/psychographics stay fixed) and returns it.
 * The client applies it via PATCH so the user stays in control of the save.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/personas/[id]/regenerate-backstory">,
) {
  const { id } = await ctx.params;
  const [persona] = await db.select().from(personas).where(eq(personas.id, id));
  if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });

  const result = await generate({
    role: "generator",
    schema: RegeneratedBackstorySchema,
    system: PERSONA_GEN_SYSTEM,
    prompt: buildBackstoryRegenPrompt(persona),
  });

  return NextResponse.json({ backstory: result.object.backstory });
}
