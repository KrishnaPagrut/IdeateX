import { cn } from "@/lib/utils";
import type { CampaignItemKind, CampaignItemSnapshot, ItemState } from "@/lib/schemas/launch";

// ---------------------------------------------------------------------------
// Shared micro-chrome for campaign items: day labels, kind badges, state
// marks. Kept tiny and mono — Berkeley Mono carries all classification labels
// in this app; the launch-day accent is the only color statement.
// ---------------------------------------------------------------------------

/** "D-7" · "Launch day" · "D+3" — offsets relative to launch. */
export function dayLabel(offset: number): string {
  if (offset === 0) return "Launch day";
  return offset > 0 ? `D+${offset}` : `D${offset}`;
}

/** Compact form for chips and ranges, where "Launch day" doesn't fit. */
export function dayShort(offset: number): string {
  if (offset === 0) return "D0";
  return offset > 0 ? `D+${offset}` : `D${offset}`;
}

export const KIND_LABELS: Record<CampaignItemKind, string> = {
  teaser: "teaser",
  announcement: "announcement",
  launch: "launch",
  follow_up: "follow-up",
  community: "community",
  promo: "promo",
};

export function KindBadge({ kind }: { kind: CampaignItemKind }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-px font-mono text-3xs tracking-eyebrow uppercase",
        kind === "launch"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {KIND_LABELS[kind]}
    </span>
  );
}

const STATE_DOT: Record<ItemState, string> = {
  draft: "bg-muted-foreground/40",
  approved: "bg-primary",
  cut: "bg-destructive/70",
};

export function StateDot({ state, className }: { state: ItemState; className?: string }) {
  return (
    <span
      aria-label={`state: ${state}`}
      className={cn("size-1.5 shrink-0 rounded-full", STATE_DOT[state], className)}
    />
  );
}

const STATE_CHIP: Record<ItemState, string> = {
  draft: "border-border text-muted-foreground",
  approved: "border-primary/40 bg-primary/10 text-primary",
  cut: "border-destructive/30 text-destructive/80",
};

export function StateChip({ state }: { state: ItemState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-px font-mono text-3xs tracking-eyebrow uppercase",
        STATE_CHIP[state],
      )}
    >
      {state}
    </span>
  );
}

/** Stable presentation order: day, then the run's own sortOrder. */
export function sortItems(items: CampaignItemSnapshot[]): CampaignItemSnapshot[] {
  return [...items].sort((a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder);
}
