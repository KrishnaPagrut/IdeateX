"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import rawFixture from "@/fixtures/launch-kit-fixture.json";
import { Button } from "@/components/ui/button";
import { LaunchKitView, type ViewMode } from "@/components/launch-kit/launch-kit-view";
import type { ImageStreamState } from "@/lib/hooks/use-image-stream";
import type { ItemPatch, LaunchKitStatus } from "@/lib/hooks/use-launch-kit";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

// ---------------------------------------------------------------------------
// Dev harness: drives the launch-kit surface from the fixture with no backend.
// "Generate" waits ~1.6s (the plan), then the four missing visuals stream in
// over ~8s so the shimmer-to-image swap can be watched and tuned. PATCHes
// mutate local state; "regenerate image" clears a tile and re-delivers it.
// ---------------------------------------------------------------------------

const FIXTURE_ITEMS = (rawFixture as { items: CampaignItemSnapshot[] }).items;

/** Simulated Grok Imagine results for the four fixture items missing a visual. */
const STREAMED_URLS: Record<string, string> = {
  "lk-03": "https://picsum.photos/seed/sprout-roast/1280/720",
  "lk-06": "https://picsum.photos/seed/sprout-email/1280/720",
  "lk-07": "https://picsum.photos/seed/sprout-kit/1280/720",
  "lk-09": "https://picsum.photos/seed/sprout-fern/1280/720",
};

/** ms after generation completes at which each visual "finishes rendering". */
const ARRIVALS = [1800, 3800, 5900, 8000];

const IDLE_STREAM: ImageStreamState = { urls: {}, pending: 0, received: 0, active: false };

export default function LaunchKitDevPage() {
  const [status, setStatus] = useState<LaunchKitStatus>("none");
  const [items, setItems] = useState<CampaignItemSnapshot[] | null>(null);
  const [stream, setStream] = useState<ImageStreamState>(IDLE_STREAM);
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const { setTheme } = useTheme();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const generate = useCallback(() => {
    setStatus("generating");
    timers.current.push(
      setTimeout(() => {
        setItems(FIXTURE_ITEMS.map((i) => ({ ...i })));
        setStatus("ready");
        const pending = FIXTURE_ITEMS.filter((i) => i.imagePrompt && !i.imageUrl).map((i) => i.id);
        setStream({ urls: {}, pending: pending.length, received: 0, active: pending.length > 0 });
        pending.forEach((id, idx) => {
          timers.current.push(
            setTimeout(
              () => {
                setStream((s) => ({
                  ...s,
                  urls: { ...s.urls, [id]: STREAMED_URLS[id] ?? `https://picsum.photos/seed/${id}/1280/720` },
                  received: idx + 1,
                  active: idx + 1 < pending.length,
                }));
              },
              ARRIVALS[idx] ?? (idx + 1) * 2000,
            ),
          );
        });
      }, 1600),
    );
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setStatus("none");
    setItems(null);
    setStream(IDLE_STREAM);
  }, [clearTimers]);

  // Screenshot/deep-link params: ?auto=1 generates on load, ?view=list|assets
  // picks the initial view, ?sel=<id> opens the inspector, ?theme=dark forces
  // the theme. Client-only, so the harness renders after mount. Timer cleanup
  // lives in this same effect so a StrictMode remount re-boots cleanly.
  useEffect(() => {
    // Boot from the URL — an external system, dev-harness only.
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    setParams(q);
    const theme = q.get("theme");
    if (theme) setTheme(theme);
    if (q.get("auto") === "1") generate();
    /* eslint-enable react-hooks/set-state-in-effect */
    return clearTimers;
  }, [generate, setTheme, clearTimers]);

  const onPatch = useCallback(async (itemId: string, patch: ItemPatch) => {
    if ("action" in patch) {
      // regenerate_image: drop the visual, then "re-render" it after 2.5s.
      setItems((prev) =>
        prev ? prev.map((i) => (i.id === itemId ? { ...i, imageUrl: null } : i)) : prev,
      );
      setStream((s) => {
        const urls = { ...s.urls };
        delete urls[itemId];
        return { ...s, urls, pending: 1, received: 0, active: true };
      });
      timers.current.push(
        setTimeout(() => {
          setStream((s) => ({
            ...s,
            urls: { ...s.urls, [itemId]: `https://picsum.photos/seed/${itemId}-v${Date.now() % 97}/1280/720` },
            received: 1,
            active: false,
          }));
        }, 2500),
      );
      return;
    }
    // Simulated network latency, then merge the field patch.
    await new Promise((r) => setTimeout(r, 300));
    setItems((prev) =>
      prev ? prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) : prev,
    );
  }, []);

  if (!params) return null;

  const view = params.get("view");
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-2.5">
        <p className="font-mono text-3xs tracking-stamp text-muted-foreground uppercase">
          Dev harness · launch kit · fixture data, simulated stream
        </p>
        <Button variant="outline" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>
      <LaunchKitView
        items={items}
        status={status}
        error={null}
        onGenerate={generate}
        stream={stream}
        onPatch={onPatch}
        defaultView={view === "list" || view === "assets" ? (view as ViewMode) : "calendar"}
        defaultSelectedId={params.get("sel")}
      />
    </div>
  );
}
