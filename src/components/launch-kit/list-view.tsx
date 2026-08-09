"use client";

import { cn } from "@/lib/utils";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

import { dayShort, KindBadge, sortItems, StateChip } from "./item-chrome";

// ---------------------------------------------------------------------------
// List view: the whole plan as one scannable ledger, sorted by day. Day chip,
// kind, title with first line of copy, platform, state.
// ---------------------------------------------------------------------------

export function ListView({
  items,
  selectedId,
  onSelect,
}: {
  items: CampaignItemSnapshot[];
  selectedId: string | null;
  onSelect: (item: CampaignItemSnapshot) => void;
}) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {sortItems(items).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            item.id === selectedId && "bg-secondary/50",
          )}
        >
          <span
            className={cn(
              "w-11 shrink-0 font-mono text-2xs tabular-nums",
              item.dayOffset === 0 ? "font-bold text-primary" : "text-muted-foreground",
            )}
          >
            {dayShort(item.dayOffset)}
          </span>
          <span className="hidden w-24 shrink-0 sm:block">
            <KindBadge kind={item.kind} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-xs font-medium",
                item.state === "cut" && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </span>
            <span className="block truncate text-2xs text-muted-foreground">
              {item.body.split("\n")[0]}
            </span>
          </span>
          <span className="hidden shrink-0 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase md:block">
            {item.platform}
          </span>
          <StateChip state={item.state} />
        </button>
      ))}
    </div>
  );
}
