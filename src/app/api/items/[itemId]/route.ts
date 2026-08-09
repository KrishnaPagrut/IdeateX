import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  ITEM_STATES,
  type CampaignItemKind,
  type CampaignItemSnapshot,
} from "@/lib/schemas/launch";
import type { Platform } from "@/lib/schemas/marketing";
import type { CampaignItemRow } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db imported lazily inside the handlers — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RegenerateSchema = z.object({ action: z.literal("regenerate_image") });

const EditSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).optional(),
    callToAction: z.string().trim().max(300).optional(),
    hashtags: z.array(z.string().trim().min(1)).max(4).optional(),
    state: z.enum(ITEM_STATES).optional(),
    dayOffset: z.number().int().min(-30).max(60).optional(),
    /** null clears the prompt (and therefore the image). */
    imagePrompt: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

function toSnapshot(row: CampaignItemRow): CampaignItemSnapshot {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind as CampaignItemKind,
    state: row.state,
    title: row.title,
    body: row.body,
    dayOffset: row.dayOffset,
    platform: row.platform as Platform,
    targetCohorts: row.targetCohorts,
    purpose: row.purpose,
    callToAction: row.callToAction,
    hashtags: row.hashtags,
    imagePrompt: row.imagePrompt,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[itemId]">) {
  const { itemId } = await ctx.params;
  if (!UUID_RE.test(itemId)) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { db, campaignItems } = await import("@/lib/db");

  const [item] = await db
    .select()
    .from(campaignItems)
    .where(eq(campaignItems.id, itemId))
    .limit(1);
  if (!item) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  // `{action: "regenerate_image"}` — null the url so the image stream
  // (GET /api/runs/[runId]/images) regenerates exactly this item.
  const regen = RegenerateSchema.safeParse(body);
  if (regen.success) {
    if (!item.imagePrompt) {
      return Response.json({ error: "Item has no image prompt" }, { status: 400 });
    }
    const [updated] = await db
      .update(campaignItems)
      .set({ imageUrl: null, updatedAt: new Date() })
      .where(eq(campaignItems.id, itemId))
      .returning();
    return Response.json({ item: toSnapshot(updated) });
  }

  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid item update", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const edits = parsed.data;
  if (Object.keys(edits).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const patch: Partial<typeof campaignItems.$inferInsert> = { updatedAt: new Date() };
  if (edits.title !== undefined) patch.title = edits.title;
  if (edits.body !== undefined) patch.body = edits.body;
  if (edits.callToAction !== undefined) patch.callToAction = edits.callToAction;
  if (edits.hashtags !== undefined) patch.hashtags = edits.hashtags;
  if (edits.state !== undefined) patch.state = edits.state;
  if (edits.dayOffset !== undefined) patch.dayOffset = edits.dayOffset;
  if (edits.imagePrompt !== undefined) {
    patch.imagePrompt = edits.imagePrompt;
    // A cleared or changed prompt invalidates the generated image; nulling the
    // url puts the item back into the image stream's pending set.
    if (edits.imagePrompt !== item.imagePrompt) patch.imageUrl = null;
  }

  const [updated] = await db
    .update(campaignItems)
    .set(patch)
    .where(eq(campaignItems.id, itemId))
    .returning();

  return Response.json({ item: toSnapshot(updated) });
}

/** Soft delete: launch-kit items are cut, never destroyed. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/items/[itemId]">) {
  const { itemId } = await ctx.params;
  if (!UUID_RE.test(itemId)) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const { db, campaignItems } = await import("@/lib/db");

  const [updated] = await db
    .update(campaignItems)
    .set({ state: "cut", updatedAt: new Date() })
    .where(eq(campaignItems.id, itemId))
    .returning();
  if (!updated) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  return Response.json({ item: toSnapshot(updated) });
}
