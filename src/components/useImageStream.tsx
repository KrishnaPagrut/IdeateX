"use client";

import { useEffect, useRef, useState } from "react";

export type ImageArrival = { kind: "strategy" | "item"; id: string; url: string };

export type ImageStreamState = {
  /** Images received this session, keyed by strategy or item id. */
  urls: Record<string, string>;
  pending: number;
  received: number;
  active: boolean;
};

/**
 * Subscribes to /api/images and reports each generated image as it lands.
 *
 * `enabled` gates the connection so we don't open a stream before the page
 * knows whether anything is actually missing an image.
 */
export function useImageStream(campaignId: string, enabled: boolean): ImageStreamState {
  const [state, setState] = useState<ImageStreamState>({
    urls: {},
    pending: 0,
    received: 0,
    active: false,
  });
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    const es = new EventSource(`/api/images?campaignId=${campaignId}`);

    es.addEventListener("start", (e) => {
      const { total } = JSON.parse((e as MessageEvent).data);
      setState((s) => ({ ...s, pending: total, active: total > 0 }));
    });

    es.addEventListener("image", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as ImageArrival & { done: number };
      setState((s) => ({
        ...s,
        urls: { ...s.urls, [d.id]: d.url },
        received: d.done,
      }));
    });

    es.addEventListener("done", () => {
      setState((s) => ({ ...s, active: false }));
      es.close();
    });

    es.addEventListener("error", () => {
      setState((s) => ({ ...s, active: false }));
      es.close();
    });

    es.onerror = () => {
      setState((s) => ({ ...s, active: false }));
      es.close();
    };

    return () => es.close();
  }, [campaignId, enabled]);

  return state;
}

/** Shimmer placeholder shown while an image is still generating. */
export function ImageSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-[var(--track)] ${className}`}
      aria-label="Generating image"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.75), transparent)",
          animation: "shimmer 1.5s infinite",
        }}
      />
    </div>
  );
}
