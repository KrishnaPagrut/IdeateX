"use client";

import { useSyncExternalStore } from "react";

import { formatRelativeTime } from "@/app/runs/format";

// ---------------------------------------------------------------------------
// Hydration-safe relative timestamps. Naively rendering "3m ago" in a client
// component computes different strings on the server and at hydration
// (different Date.now), causing hydration-mismatch errors — and the label
// then never updates. This renders a deterministic absolute date on the
// server pass, swaps to the relative form right after hydration, and
// re-renders every 30s through one shared interval.
// ---------------------------------------------------------------------------

const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let nowCache = 0;

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  if (timer === null) {
    nowCache = Date.now();
    timer = setInterval(() => {
      nowCache = Date.now();
      for (const notify of subscribers) notify();
    }, 30_000);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (nowCache === 0) nowCache = Date.now();
  return nowCache;
}

function getServerSnapshot(): number {
  return 0; // sentinel: "clock not available" — render the absolute form
}

/** Deterministic fallback shown on the server pass — same on every machine. */
function absoluteLabel(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <time dateTime={iso} className={className} title={iso}>
      {now === 0 ? absoluteLabel(iso) : formatRelativeTime(iso, now)}
    </time>
  );
}
