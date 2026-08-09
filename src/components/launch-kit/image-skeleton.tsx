"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shimmer placeholder for a still-generating visual, ported from LaunchLab and
// adapted to the token system: the sweep is a color-mix of the theme's own
// foreground, so it stays subtle in light AND dark instead of a white flash.
// Watching these tiles fill one by one is the launch kit's progress indicator.
// ---------------------------------------------------------------------------

/** React 19 hoists+dedupes this via href/precedence, so N skeletons share one tag. */
function ShimmerKeyframes() {
  return (
    <style href="lk-shimmer" precedence="default">
      {`@keyframes lk-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@media (prefers-reduced-motion: no-preference){.lk-shimmer-sweep{animation:lk-shimmer 1.8s ease-in-out infinite}}`}
    </style>
  );
}

export function ImageSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Generating image"
      className={cn("relative overflow-hidden bg-muted", className)}
    >
      <ShimmerKeyframes />
      <div
        aria-hidden
        className="lk-shimmer-sweep absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 20%, color-mix(in oklch, var(--foreground) 7%, transparent) 50%, transparent 80%)",
        }}
      />
    </div>
  );
}

/** An arrived visual: fades in on load so the swap over the shimmer reads as a reveal. */
export function ItemImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images can complete before hydration and never fire onLoad.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated remote URLs, not optimizable assets
    <img
      ref={ref}
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={cn(
        "bg-muted object-cover transition-opacity duration-700",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
