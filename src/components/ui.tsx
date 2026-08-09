"use client";

/**
 * Design-system primitives.
 *
 * These exist so signature elements (section labels, gradient headlines, stat
 * tiles, scroll reveals) are declared once and reused, rather than each page
 * reimplementing the same badge or the same shimmer. Anything that appears on
 * more than one screen belongs here.
 */
import { useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * Scroll reveal
 * ------------------------------------------------------------------------- */

/**
 * Adds `is-visible` when the element scrolls into view, driving the CSS
 * entrance animation. One observer per element, disconnected after firing —
 * entrances play once, matching the design system's `{ once: true }` intent.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "-40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Wraps children in a scroll-triggered fade-up. `delay` staggers siblings. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Typography
 * ------------------------------------------------------------------------- */

/** Section orienting badge: pill, optional pulsing dot, mono uppercase. */
export function SectionLabel({
  children,
  live = false,
  tone,
}: {
  children: React.ReactNode;
  live?: boolean;
  tone?: string;
}) {
  return (
    <span
      className="section-label"
      style={tone ? { color: tone, borderColor: `${tone}47`, background: `${tone}0f` } : undefined}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "pulse-dot" : ""}`}
        style={{ background: tone ?? "var(--accent)" }}
      />
      {children}
    </span>
  );
}

/** Applies the signature gradient to a run of text. One per page, ideally. */
export function GradientText({
  children,
  underline = false,
}: {
  children: React.ReactNode;
  underline?: boolean;
}) {
  return (
    <span className={underline ? "gradient-underline" : undefined}>
      <span className="gradient-text">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Data display
 * ------------------------------------------------------------------------- */

/**
 * Metric tile. `tone` colours the figure for values that carry a warning
 * (expected slippage, brand-safety risk); `invert` styles it for use inside a
 * dark inverted section.
 */
export function Stat({
  label,
  value,
  sub,
  tone,
  invert = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: string;
  invert?: boolean;
}) {
  return (
    <div>
      <div
        className="label mb-2"
        style={invert ? { color: "rgb(255 255 255 / 0.5)" } : undefined}
      >
        {label}
      </div>
      <div
        className="mono text-[30px] font-medium leading-none tracking-tight"
        style={{ color: tone ?? (invert ? "#fff" : "var(--ink)") }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-2 text-[12px]"
          style={{ color: invert ? "rgb(255 255 255 / 0.45)" : "var(--faint)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Horizontal meter used for scores, risk and trait bars. */
export function Meter({
  value,
  max = 100,
  tone = "var(--accent)",
  height = 6,
}: {
  value: number;
  max?: number;
  tone?: string;
  height?: number;
}) {
  return (
    <div
      className="flex-1 overflow-hidden rounded-full"
      style={{ height, background: "var(--track)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: tone }}
      />
    </div>
  );
}

/**
 * Outcome distribution from a Monte Carlo run.
 *
 * The point of this chart is the gap between the single number a naive plan
 * quotes and the spread of what actually happens, so the deterministic
 * estimate and the percentile markers are drawn *on* the distribution rather
 * than listed beside it.
 */
export function DistributionChart({
  bins,
  markers,
  height = 150,
  unit = "d",
}: {
  bins: Array<{ day: number; count: number }>;
  markers: Array<{ at: number; label: string; tone: string; dashed?: boolean }>;
  height?: number;
  unit?: string;
}) {
  if (!bins.length) return null;
  const max = Math.max(...bins.map((b) => b.count)) || 1;
  const min = bins[0].day;
  const span = (bins[bins.length - 1].day - min) || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  return (
    <div>
      <div className="relative flex items-end gap-[2px]" style={{ height }}>
        {bins.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[2px] transition-all duration-500"
            style={{
              height: `${(b.count / max) * 100}%`,
              background: "var(--gradient)",
              opacity: 0.28 + (b.count / max) * 0.62,
            }}
            title={`${b.day.toFixed(1)}${unit} — ${b.count} runs`}
          />
        ))}

        {markers.map((m) => (
          <div
            key={m.label}
            className="pointer-events-none absolute bottom-0 top-0"
            style={{ left: `${pos(m.at)}%` }}
          >
            <div
              className="h-full"
              style={{
                width: 0,
                borderLeft: `2px ${m.dashed ? "dashed" : "solid"} ${m.tone}`,
              }}
            />
            <span
              className="mono absolute -top-1 left-1.5 whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[0.08em]"
              style={{ color: m.tone }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="mono mt-2 flex justify-between text-[10px]"
        style={{ color: "var(--faint)" }}
      >
        <span>
          {bins[0].day.toFixed(0)}
          {unit}
        </span>
        <span>
          {bins[bins.length - 1].day.toFixed(0)}
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Feedback
 * ------------------------------------------------------------------------- */

/** Shimmer placeholder for content still being generated. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: "var(--track)" }}
      aria-label="Generating"
      role="status"
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.8), transparent)",
          animation: "shimmer 1.6s infinite",
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Hero graphic
 * ------------------------------------------------------------------------- */

/**
 * Abstract generative composition for the landing hero: a slowly rotating
 * dashed ring, floating cards on offset cycles, and a dot grid. Decorative
 * only — hidden from assistive tech and from small screens.
 */
export function HeroGraphic() {
  const [tick, setTick] = useState(0);
  // A single slow tick drives the "live" numbers so the composition reads as
  // a working product rather than a static illustration.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => (v + 1) % 100), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative hidden h-[420px] w-full lg:block" aria-hidden="true">
      {/* Rotating dashed ring */}
      <svg className="spin-slow absolute inset-0 m-auto" width="380" height="380" viewBox="0 0 380 380">
        <circle
          cx="190"
          cy="190"
          r="182"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.18"
          strokeWidth="1"
          strokeDasharray="6 10"
        />
        <circle
          cx="190"
          cy="190"
          r="140"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
      </svg>

      {/* Ambient glow */}
      <div
        className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "var(--accent)", opacity: 0.07, filter: "blur(90px)" }}
      />

      {/* CTO card */}
      <div className="float absolute left-[6%] top-[14%] w-[196px]">
        <div className="panel p-3.5" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center gap-2">
            <span className="icon-tile !h-7 !w-7 !rounded-md text-[11px] font-semibold">C</span>
            <span className="text-[12.5px] font-semibold">CTO</span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] text-[var(--muted)]">critical path</span>
              <span className="mono text-[11px] font-medium">{34 + (tick % 3)}d</span>
            </div>
            <Meter value={62} height={4} />
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] text-[var(--muted)]">expected slip</span>
              <span className="mono text-[11px]" style={{ color: "var(--warn)" }}>
                +{20 + (tick % 2)}d
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CMO card */}
      <div className="float-slow absolute right-[4%] top-[38%] w-[208px]" style={{ animationDelay: "1.2s" }}>
        <div className="panel p-3.5" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold text-white"
              style={{ background: "var(--cmo)" }}
            >
              M
            </span>
            <span className="text-[12.5px] font-semibold">CMO</span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {[
              ["trust", 74, "var(--accent)"],
              ["purchase intent", 34, "var(--cmo)"],
              ["controversy", 36, "var(--warn)"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="flex items-center gap-2">
                <span className="w-[86px] shrink-0 text-[10px] text-[var(--muted)]">{l as string}</span>
                <Meter value={v as number} height={4} tone={c as string} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finding chip */}
      <div className="float absolute bottom-[10%] left-[16%] w-[228px]" style={{ animationDelay: "2.1s" }}>
        <div
          className="rounded-xl border p-3"
          style={{
            background: "rgb(15 138 77 / 0.06)",
            borderColor: "rgb(15 138 77 / 0.28)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--pos)" }}>
            finding
          </div>
          <p className="mt-1 text-[11.5px] font-medium leading-snug">
            Quote 55 days externally, not 34.
          </p>
        </div>
      </div>

      {/* Dot grid */}
      <div className="absolute bottom-[16%] right-[12%] grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)", opacity: 0.18 + (i % 3) * 0.12 }}
          />
        ))}
      </div>

      {/* Corner accent block */}
      <div
        className="absolute right-[26%] top-[8%] h-11 w-11 rounded-xl"
        style={{ background: "var(--gradient)", boxShadow: "var(--shadow-accent-lg)" }}
      />
    </div>
  );
}
