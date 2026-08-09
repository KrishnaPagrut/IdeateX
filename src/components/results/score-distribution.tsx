"use client";

import { useState } from "react";

import type { RunAggregates } from "@/components/run-live/types";

// ---------------------------------------------------------------------------
// Adoption-likelihood histogram. Single-hue sequential (magnitude is the job),
// thin bars with 4px rounded data-ends and square baselines, 2px surface gaps,
// hover tooltip per bar, sr-only table fallback.
// ---------------------------------------------------------------------------

const W = 560;
const H = 180;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 18;
const PAD_B = 26;

/** Bar path with rounded top corners and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

export function ScoreDistribution({ aggregates }: { aggregates: RunAggregates }) {
  const [hover, setHover] = useState<number | null>(null);
  const bins = aggregates.adoptionHistogram;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const maxIdx = bins.findIndex((b) => b.count === maxCount);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const slot = plotW / bins.length;
  const gap = 2;
  const barW = Math.min(slot - gap, 24);

  const yFor = (count: number) => PAD_T + plotH - (count / maxCount) * plotH;
  const meanX = PAD_L + (aggregates.meanAdoption / 100) * plotW;

  // Clean integer y ticks
  const tickStep = maxCount <= 4 ? 1 : Math.ceil(maxCount / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= maxCount; t += tickStep) ticks.push(t);

  return (
    <section className="rounded-xl border bg-card p-5">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Adoption distribution</h3>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            n = {aggregates.completed} personas · adoption likelihood 0–100
          </p>
        </div>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          median {aggregates.medianAdoption}
        </p>
      </header>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Histogram of adoption likelihood across ${aggregates.completed} personas`}
        >
          {/* recessive gridlines */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={yFor(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground font-mono"
                fontSize={9}
              >
                {t}
              </text>
            </g>
          ))}

          {/* bars */}
          {bins.map((b, i) => {
            const x = PAD_L + i * slot + (slot - barW) / 2;
            const h = (b.count / maxCount) * plotH;
            return (
              <g key={b.min}>
                {b.count > 0 && (
                  <path
                    d={barPath(x, yFor(b.count), barW, h, 4)}
                    fill="var(--primary)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                {/* direct label on the modal bar only */}
                {i === maxIdx && b.count > 0 && (
                  <text
                    x={x + barW / 2}
                    y={yFor(b.count) - 5}
                    textAnchor="middle"
                    className="fill-foreground font-mono"
                    fontSize={10}
                  >
                    {b.count}
                  </text>
                )}
                {/* oversized hit target for hover */}
                <rect
                  x={PAD_L + i * slot}
                  y={PAD_T}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}

          {/* mean marker */}
          <line
            x1={meanX}
            x2={meanX}
            y1={PAD_T - 4}
            y2={PAD_T + plotH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={meanX + 4}
            y={PAD_T + 4}
            className="fill-muted-foreground font-mono"
            fontSize={9}
          >
            mean {aggregates.meanAdoption}
          </text>

          {/* x axis */}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + plotH}
            y2={PAD_T + plotH}
            stroke="var(--border)"
            strokeWidth={1}
          />
          {[0, 25, 50, 75, 100].map((v) => (
            <text
              key={v}
              x={PAD_L + (v / 100) * plotW}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize={9}
            >
              {v}
            </text>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-md border bg-popover px-2 py-1 font-mono text-[10px] whitespace-nowrap text-popover-foreground shadow-sm"
            style={{
              left: `${((PAD_L + hover * slot + slot / 2) / W) * 100}%`,
              top: 0,
            }}
          >
            {bins[hover].min}–{bins[hover].max}: {bins[hover].count}{" "}
            {bins[hover].count === 1 ? "persona" : "personas"}
          </div>
        )}
      </div>

      {/* table fallback for assistive tech */}
      <table className="sr-only">
        <caption>Adoption likelihood histogram</caption>
        <thead>
          <tr>
            <th>Range</th>
            <th>Personas</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => (
            <tr key={b.min}>
              <td>
                {b.min}–{b.max}
              </td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
