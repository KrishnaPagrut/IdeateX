"use client";

import { useEffect, useRef, useState } from "react";

import { ImageStreamEventSchema } from "@/lib/schemas/launch";

// ---------------------------------------------------------------------------
// Image stream hook — ported from LaunchLab's useImageStream. Subscribes to
// GET /api/runs/[runId]/images (SSE) and reports each Grok Imagine visual as
// it lands, so the UI can swap it over its shimmer placeholder.
// ---------------------------------------------------------------------------

export interface ImageStreamState {
  /** Images received this session, keyed by campaign item id. */
  urls: Record<string, string>;
  pending: number;
  received: number;
  active: boolean;
}

const IDLE: ImageStreamState = { urls: {}, pending: 0, received: 0, active: false };

/**
 * `enabled` gates the connection so we don't open a stream before the page
 * knows whether anything is actually missing an image. When `enabled` drops
 * to false (all images persisted) the guard resets, so a later regeneration
 * opens a fresh stream.
 */
export function useImageStream(runId: string, enabled: boolean): ImageStreamState {
  const [state, setState] = useState<ImageStreamState>(IDLE);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;

    const es = new EventSource(`/api/runs/${runId}/images`);

    // Every payload carries a discriminating `type`, so named SSE events and
    // default messages funnel into the same handler.
    const handle = (raw: string) => {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return;
      }
      const parsed = ImageStreamEventSchema.safeParse(json);
      if (!parsed.success) return;
      const event = parsed.data;
      switch (event.type) {
        case "start":
          setState((s) => ({ ...s, pending: event.total, active: event.total > 0 }));
          break;
        case "image":
          setState((s) => ({
            ...s,
            urls: { ...s.urls, [event.itemId]: event.url },
            received: event.done,
            pending: event.total,
          }));
          break;
        case "failed":
          // The tile keeps its skeleton; the item can be regenerated later.
          break;
        case "done":
          setState((s) => ({ ...s, active: false }));
          es.close();
          break;
      }
    };

    const onEvent = (e: Event) => handle((e as MessageEvent).data as string);
    for (const type of ["start", "image", "failed", "done"]) {
      es.addEventListener(type, onEvent);
    }
    es.onmessage = onEvent;
    es.onerror = () => {
      setState((s) => ({ ...s, active: false }));
      es.close();
    };

    return () => es.close();
  }, [runId, enabled]);

  return state;
}
