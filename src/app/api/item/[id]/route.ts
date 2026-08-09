/**
 * Per-item mutations: manual edits, AI edit actions, image regeneration,
 * state changes, and delete. Every mutation snapshots the previous version
 * first so edits are undoable.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { ai } from "@/lib/ai";
import { hashSeed } from "@/lib/ai/rng";
import { saveVersion } from "@/lib/campaign";
import { db, schema } from "@/lib/db";
import { EditActionSchema, EditResultSchema, ItemStateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  /** Direct field edits from the inspector. */
  patch: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      scheduledAt: z.string().optional(),
      platform: z.string().optional(),
      purpose: z.string().optional(),
      callToAction: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      imagePrompt: z.string().optional(),
      imageUrl: z.string().optional(),
      state: ItemStateSchema.optional(),
      targetCohortIds: z.array(z.string()).optional(),
    })
    .optional(),
  /** Or an AI action to apply. */
  action: EditActionSchema.optional(),
  actionArg: z.string().optional(),
});

function readItem(id: string) {
  return db.select().from(schema.campaignItems).where(eq(schema.campaignItems.id, id)).get();
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", detail: parsed.error.flatten() }, { status: 400 });
  }

  const item = readItem(params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { patch, action, actionArg } = parsed.data;
  const updates: Record<string, unknown> = {};
  let source = "manual";
  let note: string | undefined;

  if (action) {
    source = action;

    if (action === "regenerate_image") {
      const prompt = actionArg ?? item.imagePrompt ?? item.title;
      const images = await ai.image(prompt, { seed: hashSeed(prompt + item.version), n: 3 });
      updates.imageUrl = images[0].url;
      updates.imagePrompt = prompt;
      updates.imageVariants = JSON.stringify(images.map((i) => i.url));
      note = `Generated ${images.length} variations via ${images[0].provider}.`;

      db.insert(schema.artifacts)
        .values(
          images.map((img) => ({
            id: nanoid(12),
            campaignId: item.campaignId,
            itemId: item.id,
            kind: "image",
            prompt: img.prompt,
            url: img.url.startsWith("data:") ? null : img.url,
            inlineData: img.url.startsWith("data:") ? img.url : null,
            provider: img.provider,
          })),
        )
        .run();
    } else if (action === "move_date") {
      if (!actionArg) return NextResponse.json({ error: "move_date needs actionArg" }, { status: 400 });
      updates.scheduledAt = actionArg;
      note = `Moved to ${actionArg}.`;
    } else {
      // Copy-editing actions go through the model.
      const result = await ai.structured(
        EditResultSchema,
        "You are a precise copy editor for marketing assets. Apply exactly the requested change and nothing else. Preserve the item's intent.",
        [
          `Action: ${action}`,
          actionArg ? `Target: ${actionArg}` : "",
          `Platform: ${item.platform}`,
          `Purpose: ${item.purpose}`,
          `Current copy:\n${item.body}`,
          item.callToAction ? `Current CTA: ${item.callToAction}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        {
          task: "edit",
          seed: hashSeed(`${item.id}:${action}:${item.version}`),
          context: { action, body: item.body, cta: item.callToAction, platform: actionArg },
        },
      );

      if (result.body) updates.body = result.body;
      if (result.callToAction) updates.callToAction = result.callToAction;
      if (result.hashtags) updates.hashtags = JSON.stringify(result.hashtags);
      if (result.imagePrompt) updates.imagePrompt = result.imagePrompt;
      note = result.note;

      // Alternatives are returned to the client for selection rather than
      // applied — the user picks which one they want.
      if (result.alternatives?.length) {
        saveVersion(item.id, action, note);
        return NextResponse.json({ item: readItem(params.id), alternatives: result.alternatives, note });
      }
    }
  }

  if (patch) {
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined) return;
      updates[k] = Array.isArray(v) ? JSON.stringify(v) : v;
    });
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ item, note: "no changes" });
  }

  saveVersion(item.id, source, note);
  db.update(schema.campaignItems)
    .set({ ...updates, version: item.version + 1, updatedAt: new Date().toISOString() })
    .where(eq(schema.campaignItems.id, item.id))
    .run();

  // State transitions are audited.
  if (patch?.state && patch.state !== item.state) {
    db.insert(schema.approvals)
      .values({
        id: nanoid(12),
        itemId: item.id,
        fromState: item.state,
        toState: patch.state,
        actor: "user",
      })
      .run();
  }

  return NextResponse.json({ item: readItem(params.id), note });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const item = readItem(params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(schema.campaignItems).where(eq(schema.campaignItems.id, params.id)).run();
  return NextResponse.json({ ok: true });
}

/** Version history, for undo. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const versions = db
    .select()
    .from(schema.itemVersions)
    .where(eq(schema.itemVersions.itemId, params.id))
    .all();
  return NextResponse.json({ versions });
}
