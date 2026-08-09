"use client";

import { useCallback, useEffect, useState } from "react";

import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

// ---------------------------------------------------------------------------
// Launch-kit data hook. Wraps GET/POST /api/runs/[runId]/launch-kit:
//   GET 200 {items: []} → not generated yet ("none")
//   GET 200 {items: [...]} → "ready"
//   POST 201 → {items}; POST 409 also returns {items} (someone generated it
//              first — same outcome, treated as success)
// ---------------------------------------------------------------------------

/** "loading" is the initial fetch; the button-worthy states are the other three. */
export type LaunchKitStatus = "loading" | "none" | "generating" | "ready";

/** PATCH /api/items/[itemId] body: a field patch, or a named action. */
export type ItemPatch =
  | Partial<
      Pick<
        CampaignItemSnapshot,
        "title" | "body" | "callToAction" | "hashtags" | "state" | "dayOffset"
      >
    >
  | { action: "regenerate_image" };

/** Contracts: GET may return an empty list — that means "none", not "ready". */
export function launchKitStatusFromItems(items: CampaignItemSnapshot[]): "none" | "ready" {
  return items.length === 0 ? "none" : "ready";
}

export async function patchItem(
  itemId: string,
  body: ItemPatch,
): Promise<CampaignItemSnapshot> {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);
  const json = (await res.json()) as { item?: CampaignItemSnapshot } & CampaignItemSnapshot;
  return json.item ?? json;
}

export interface UseLaunchKitResult {
  items: CampaignItemSnapshot[] | null;
  status: LaunchKitStatus;
  error: string | null;
  /** Kick off generation. 409 (already generated) counts as success. */
  generate: () => Promise<void>;
  /** Re-fetch the items (after a PATCH, or when the image stream settles). */
  refresh: () => Promise<void>;
}

export function useLaunchKit(runId: string): UseLaunchKitResult {
  const [items, setItems] = useState<CampaignItemSnapshot[] | null>(null);
  const [status, setStatus] = useState<LaunchKitStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/launch-kit`, { cache: "no-store" });
      if (!res.ok) {
        setError(`Could not load the launch kit (HTTP ${res.status})`);
        setStatus((s) => (s === "loading" || s === "generating" ? "none" : s));
        return;
      }
      const body = (await res.json()) as { items: CampaignItemSnapshot[] };
      const next = launchKitStatusFromItems(body.items ?? []);
      // Never demote an in-flight generation on a concurrent empty poll.
      setStatus((s) => (s === "generating" && next === "none" ? s : next));
      setItems(next === "ready" ? body.items : null);
      setError(null);
    } catch {
      setError("Could not load the launch kit — check your connection");
      setStatus((s) => (s === "loading" || s === "generating" ? "none" : s));
    }
  }, [runId]);

  useEffect(() => {
    // Initial fetch: every setState inside refresh happens after an await,
    // so nothing renders synchronously from this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const generate = useCallback(async () => {
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/launch-kit`, { method: "POST" });
      // 409 = already generated; the route returns the existing items either way.
      if (res.ok || res.status === 409) {
        const body = (await res.json()) as { items?: CampaignItemSnapshot[]; error?: string };
        const list = body.items ?? [];
        if (launchKitStatusFromItems(list) === "ready") {
          setItems(list);
          setStatus("ready");
          return;
        }
        setError(body.error ?? "Generation returned no timeline items");
        setStatus("none");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Generation failed (HTTP ${res.status})`);
      setStatus("none");
    } catch {
      setError("Generation failed — check your connection");
      setStatus("none");
    }
  }, [runId]);

  return { items, status, error, generate, refresh };
}
