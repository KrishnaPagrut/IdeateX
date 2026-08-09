"use client";

import { cn } from "@/lib/utils";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

import { ImageSkeleton, ItemImage } from "./image-skeleton";
import { dayShort, sortItems } from "./item-chrome";

// ---------------------------------------------------------------------------
// Assets view: the campaign's visuals as a 16:9 contact sheet. Tiles start as
// shimmer placeholders and swap to the real image as the stream delivers it —
// watching the set materialise IS the progress indicator. Grok Imagine
// returns 16:9, so the tiles match to avoid cropping generated edges.
// ---------------------------------------------------------------------------

export function AssetsView({
  items,
  imageFor,
  selectedId,
  onSelect,
}: {
  items: CampaignItemSnapshot[];
  /** Resolved URL: the persisted item.imageUrl, or the stream's fresher one. */
  imageFor: (item: CampaignItemSnapshot) => string | null;
  selectedId: string | null;
  onSelect: (item: CampaignItemSnapshot) => void;
}) {
  const withVisuals = sortItems(items).filter((item) => item.imagePrompt);

  if (withVisuals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">No items in this plan carry a visual brief.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {withVisuals.map((item) => {
        const url = imageFor(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              item.id === selectedId && "border-primary",
            )}
          >
            {url ? (
              <ItemImage src={url} alt={item.title} className="aspect-video w-full" />
            ) : (
              <ImageSkeleton className="aspect-video w-full" />
            )}
            <span className="flex items-baseline justify-between gap-2 px-2.5 py-2">
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  item.state === "cut" && "text-muted-foreground line-through",
                )}
              >
                {item.title}
              </span>
              <span className="shrink-0 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
                {item.platform} · {dayShort(item.dayOffset)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
