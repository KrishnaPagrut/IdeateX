import { z } from "zod";

import { PlatformSchema } from "./marketing";

// ---------------------------------------------------------------------------
// Launch kit: the winning strategy expanded into a dated execution plan of
// campaign items, each with copy and an image prompt. Ported from LaunchLab
// (kavya/scaffold history) and adapted to the marketing pipeline.
// ---------------------------------------------------------------------------

export const CAMPAIGN_ITEM_KINDS = [
  "teaser",
  "announcement",
  "launch",
  "follow_up",
  "community",
  "promo",
] as const;
export const CampaignItemKindSchema = z.enum(CAMPAIGN_ITEM_KINDS);
export type CampaignItemKind = z.infer<typeof CampaignItemKindSchema>;

export const ITEM_STATES = ["draft", "approved", "cut"] as const;
export type ItemState = (typeof ITEM_STATES)[number];

/** What the model returns when expanding the winning strategy into a plan. */
export const GeneratedItemSchema = z.object({
  kind: CampaignItemKindSchema,
  title: z.string(),
  body: z.string().describe("The post copy, platform-native voice"),
  /** Days relative to launch day: negative = before launch, 0 = launch day. */
  dayOffset: z.number().int().min(-30).max(60),
  platform: PlatformSchema,
  targetCohorts: z.array(z.string()).describe("Cohort names from the brief"),
  purpose: z.string().describe("What this item is for, traceable to a directive"),
  callToAction: z.string(),
  hashtags: z.array(z.string()).max(4),
  imagePrompt: z
    .string()
    .describe("A concrete visual brief for the key image — subject, style, mood, no text overlays"),
});

export const GeneratedTimelineSchema = z.object({
  items: z.array(GeneratedItemSchema).min(5).max(14),
});
export type GeneratedTimeline = z.infer<typeof GeneratedTimelineSchema>;

// --- Wire shapes ------------------------------------------------------------

/** Serialized campaign_items row as the launch-kit API returns it. */
export interface CampaignItemSnapshot {
  id: string;
  runId: string;
  kind: CampaignItemKind;
  state: ItemState;
  title: string;
  body: string;
  dayOffset: number;
  platform: z.infer<typeof PlatformSchema>;
  targetCohorts: string[];
  purpose: string;
  callToAction: string;
  hashtags: string[];
  imagePrompt: string | null;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
}

/** SSE events on the image stream (mirrors LaunchLab's /api/images contract). */
export const ImageStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), total: z.number() }),
  z.object({
    type: z.literal("image"),
    itemId: z.string(),
    url: z.string(),
    done: z.number(),
    total: z.number(),
  }),
  z.object({ type: z.literal("failed"), itemId: z.string() }),
  z.object({ type: z.literal("done"), generated: z.number(), total: z.number() }),
]);
export type ImageStreamEvent = z.infer<typeof ImageStreamEventSchema>;
