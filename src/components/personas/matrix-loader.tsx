"use client";

import type { CSSProperties } from "react";

import { DotmSquare1 } from "@/components/ui/dotm-square-1";
import { cn } from "@/lib/utils";

/**
 * Dot-matrix loading indicator (Neon Drift), pinned to the app's tokens via
 * the solid-theme preset. Wrapper supplies --color-dot-on from --primary so
 * the loader always follows the current theme.
 */
export function MatrixLoader({
  size = 20,
  className,
  label = "Loading",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      style={{ "--color-dot-on": "var(--primary)" } as CSSProperties}
    >
      <DotmSquare1
        size={size}
        dotSize={Math.max(2, Math.round(size / 8))}
        colorPreset="solid-theme"
        ariaLabel={label}
      />
    </span>
  );
}
