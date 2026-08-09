"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

import { dayLabel, KindBadge, sortItems, StateDot } from "./item-chrome";

// ---------------------------------------------------------------------------
// Calendar view: one column per scheduled day from the earliest teaser to the
// last follow-up. Time is information here — runs of quiet days compress into
// slim gap markers instead of a wall of empty columns, and launch day always
// renders (even empty: "nothing scheduled on launch day" is a finding).
// Clicking a card opens the inspector; no drag-drop in v1.
// ---------------------------------------------------------------------------

type Segment = { kind: "day"; offset: number } | { kind: "gap"; span: number };

function buildSegments(offsets: number[], byDay: Map<number, unknown>): Segment[] {
  if (offsets.length === 0) return [];
  const min = Math.min(...offsets, 0);
  const max = Math.max(...offsets, 0);
  const segments: Segment[] = [];
  let gap = 0;
  for (let d = min; d <= max; d++) {
    if (byDay.has(d) || d === 0) {
      if (gap > 0) segments.push({ kind: "gap", span: gap });
      gap = 0;
      segments.push({ kind: "day", offset: d });
    } else {
      gap++;
    }
  }
  return segments;
}

function ItemCard({
  item,
  selected,
  onSelect,
}: {
  item: CampaignItemSnapshot;
  selected: boolean;
  onSelect: (item: CampaignItemSnapshot) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "w-full rounded-md border bg-card p-2 text-left transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        selected && "border-primary",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          {item.platform}
        </span>
        <StateDot state={item.state} className="ml-auto" />
      </span>
      <span
        className={cn(
          "mt-1 block text-xs leading-snug font-medium",
          item.state === "cut" && "text-muted-foreground line-through",
        )}
      >
        {item.title}
      </span>
      <span className="mt-1.5 block">
        <KindBadge kind={item.kind} />
      </span>
    </button>
  );
}

export function CalendarView({
  items,
  selectedId,
  onSelect,
}: {
  items: CampaignItemSnapshot[];
  selectedId: string | null;
  onSelect: (item: CampaignItemSnapshot) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<number, CampaignItemSnapshot[]>();
    for (const item of sortItems(items)) {
      const list = map.get(item.dayOffset) ?? [];
      list.push(item);
      map.set(item.dayOffset, list);
    }
    return map;
  }, [items]);

  const segments = useMemo(
    () =>
      buildSegments(
        items.map((i) => i.dayOffset),
        byDay,
      ),
    [items, byDay],
  );

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {segments.map((segment, idx) => {
        if (segment.kind === "gap") {
          return (
            <div
              key={`gap-${idx}`}
              className="relative flex w-10 shrink-0 items-center justify-center"
              aria-label={`${segment.span} quiet ${segment.span === 1 ? "day" : "days"}`}
            >
              <span aria-hidden className="absolute inset-y-3 left-1/2 border-l border-dashed" />
              <span className="relative bg-background px-1 py-0.5 font-mono text-3xs text-muted-foreground/70">
                {segment.span}d
              </span>
            </div>
          );
        }
        const dayItems = byDay.get(segment.offset) ?? [];
        const isLaunch = segment.offset === 0;
        return (
          <div
            key={segment.offset}
            className={cn(
              "flex w-44 shrink-0 flex-col rounded-lg border bg-card/50",
              isLaunch && "border-primary/40",
            )}
          >
            <div
              className={cn(
                "flex items-baseline justify-between border-b px-2.5 py-1.5",
                isLaunch && "border-primary/30",
              )}
            >
              <span
                className={cn(
                  "font-mono text-3xs tracking-eyebrow uppercase",
                  isLaunch ? "font-bold text-primary" : "text-muted-foreground",
                )}
              >
                {dayLabel(segment.offset)}
              </span>
              <span className="font-mono text-3xs tabular-nums text-muted-foreground/70">
                {dayItems.length > 0 ? dayItems.length : "—"}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-1.5">
              {dayItems.length > 0 ? (
                dayItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <p className="py-4 text-center font-mono text-3xs text-muted-foreground/60">
                  nothing scheduled
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
