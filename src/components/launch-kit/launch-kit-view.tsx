"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";
import {
  patchItem,
  useLaunchKit,
  type ItemPatch,
  type LaunchKitStatus,
} from "@/lib/hooks/use-launch-kit";
import { useImageStream, type ImageStreamState } from "@/lib/hooks/use-image-stream";

import { AssetsView } from "./assets-view";
import { CalendarView } from "./calendar-view";
import { ImageSkeleton } from "./image-skeleton";
import { ItemInspector } from "./item-inspector";
import { dayShort } from "./item-chrome";
import { ListView } from "./list-view";

// ---------------------------------------------------------------------------
// The launch-kit surface. Three states:
//   none       — a considered "Generate" moment: what it does, what it costs.
//   generating — dot-matrix loader + narrative line.
//   ready      — calendar / list / assets over the same items, an inspector,
//                and a progress line while visuals stream in.
// Presentational (LaunchKitView) is split from data wiring (LaunchKitPanel)
// so the dev harness can drive it with a simulated stream.
// ---------------------------------------------------------------------------

export type ViewMode = "calendar" | "list" | "assets";
const VIEW_MODES: ViewMode[] = ["calendar", "list", "assets"];

const IDLE_STREAM: ImageStreamState = { urls: {}, pending: 0, received: 0, active: false };

function EmptyMoment({
  onGenerate,
  error,
}: {
  onGenerate: () => void;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center">
        <p className="font-mono text-3xs tracking-stamp text-primary uppercase">Launch kit</p>
        <h2 className="mt-2 font-serif text-xl leading-snug font-bold tracking-tight">
          From winning strategy to launch calendar
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          The winning strategy becomes a dated campaign plan — teasers, the announcement, launch
          day, and follow-ups. Every item carries copy, a call to action, and the finding it
          answers. Grok Imagine then renders a key visual for each one; they stream in as they
          finish.
        </p>

        {/* Filmstrip: the plan-to-be as empty frames; launch day already shimmers. */}
        <div aria-hidden className="mt-7 w-full max-w-md">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "aspect-video flex-1 overflow-hidden rounded-sm border",
                  i === 4 ? "border-primary/50" : "border-border bg-muted/50",
                )}
              >
                {i === 4 && <ImageSkeleton className="h-full w-full" />}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-3xs tracking-eyebrow text-muted-foreground/70 uppercase">
            <span>D-7</span>
            <span className="text-primary/80">launch</span>
            <span>D+14</span>
          </div>
        </div>

        <Button className="mt-7" onClick={onGenerate}>
          Generate launch kit
        </Button>
        <p className="mt-3 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          one-time generation · ≈ a few cents of images · everything editable
        </p>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function GeneratingMoment() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-16 text-center">
      <DotmSquare3 colorPreset="solid-theme" size={36} dotSize={5} ariaLabel="Generating launch kit" />
      <div>
        <p className="font-serif text-base font-bold tracking-tight">
          Expanding the winning strategy into a dated plan
        </p>
        <p className="mt-1.5 font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
          items first · visuals stream in after
        </p>
      </div>
    </div>
  );
}

function LoadingMoment() {
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <DotmSquare3 colorPreset="solid-theme" size={28} dotSize={4} ariaLabel="Loading launch kit" />
      <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
        Loading launch kit
      </p>
    </div>
  );
}

export interface LaunchKitViewProps {
  items: CampaignItemSnapshot[] | null;
  status: LaunchKitStatus;
  error: string | null;
  onGenerate: () => void;
  stream: ImageStreamState;
  onPatch: (itemId: string, patch: ItemPatch) => Promise<void>;
  /** Initial view (uncontrolled after mount) — used by the dev harness. */
  defaultView?: ViewMode;
  /** Initially inspected item id — used by the dev harness. */
  defaultSelectedId?: string | null;
}

export function LaunchKitView({
  items,
  status,
  error,
  onGenerate,
  stream,
  onPatch,
  defaultView = "calendar",
  defaultSelectedId = null,
}: LaunchKitViewProps) {
  const [view, setView] = React.useState<ViewMode>(defaultView);
  const [selectedId, setSelectedId] = React.useState<string | null>(defaultSelectedId);

  const imageFor = React.useCallback(
    (item: CampaignItemSnapshot) => item.imageUrl ?? stream.urls[item.id] ?? null,
    [stream.urls],
  );

  if (status === "loading") return <LoadingMoment />;
  if (status === "none") return <EmptyMoment onGenerate={onGenerate} error={error} />;
  if (status === "generating") return <GeneratingMoment />;

  const ready = items ?? [];
  const approved = ready.filter((i) => i.state === "approved").length;
  const offsets = ready.map((i) => i.dayOffset);
  const span =
    ready.length > 0
      ? `${dayShort(Math.min(...offsets, 0))} → ${dayShort(Math.max(...offsets, 0))}`
      : null;
  const selected = selectedId ? (ready.find((i) => i.id === selectedId) ?? null) : null;

  return (
    <div>
      {/* Toolbar: plan facts on the left, view switcher on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">
            {ready.length} items · {approved} approved{span ? ` · spans ${span}` : ""}
          </p>
          {stream.active && (
            <p className="flex items-center gap-2 font-mono text-3xs tracking-eyebrow text-primary uppercase">
              <span aria-hidden className="breathe size-1.5 rounded-full bg-primary" />
              Generating visuals — {stream.received} of {stream.pending}
            </p>
          )}
        </div>
        <div
          role="group"
          aria-label="View"
          className="flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-3xs tracking-eyebrow uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                view === mode
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {view === "calendar" && (
          <CalendarView
            items={ready}
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
          />
        )}
        {view === "list" && (
          <ListView
            items={ready}
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
          />
        )}
        {view === "assets" && (
          <AssetsView
            items={ready}
            imageFor={imageFor}
            selectedId={selectedId}
            onSelect={(item) => setSelectedId(item.id)}
          />
        )}
      </div>

      <ItemInspector
        item={selected}
        imageUrl={selected ? imageFor(selected) : null}
        onClose={() => setSelectedId(null)}
        onPatch={onPatch}
      />
    </div>
  );
}

/** Data-wired panel for the run page: real API + real SSE image stream. */
export function LaunchKitPanel({ runId }: { runId: string }) {
  const kit = useLaunchKit(runId);
  const { refresh } = kit;

  // Only open the stream when something is actually missing its visual.
  const needsImages = (kit.items ?? []).some((i) => i.imagePrompt && !i.imageUrl);
  const stream = useImageStream(runId, kit.status === "ready" && needsImages);

  // When the stream settles, re-fetch so imageUrls come from the DB and the
  // stream gate closes for good.
  const wasActive = React.useRef(false);
  React.useEffect(() => {
    if (stream.active) {
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      void refresh();
    }
  }, [stream.active, refresh]);

  const onPatch = React.useCallback(
    async (itemId: string, patch: ItemPatch) => {
      await patchItem(itemId, patch);
      await refresh();
    },
    [refresh],
  );

  return (
    <LaunchKitView
      items={kit.items}
      status={kit.status}
      error={kit.error}
      onGenerate={() => void kit.generate()}
      stream={kit.status === "ready" ? stream : IDLE_STREAM}
      onPatch={onPatch}
    />
  );
}
