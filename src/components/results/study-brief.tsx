"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Brief } from "@/lib/schemas/brief";

// ---------------------------------------------------------------------------
// The "methods" section: what the study actually tested. It sits right after
// the verdict on purpose — first the answer, then how it was produced — so
// everything below is read with the study's assumptions and blind spots in
// mind. Quiet reference material: the idea-as-framed and target market stay
// visible; segments, assumptions, risks, and ambiguities collapse on demand.
// ---------------------------------------------------------------------------

function FieldLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "font-mono text-[10px] tracking-widest text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function StudyBrief({ brief }: { brief: Brief }) {
  const [open, setOpen] = useState(true);
  const clarity = Math.round(brief.clarityScore);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
          <div>
            <div className="flex items-center gap-2">
              <FieldLabel>Idea as framed</FieldLabel>
              <Badge variant="outline" className="font-mono text-[9px] tracking-widest uppercase">
                {brief.category}
              </Badge>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
              {brief.ideaSummary}
            </p>
          </div>
          <div>
            <FieldLabel>Target market</FieldLabel>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {brief.targetMarket}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
          <span className="sr-only">{open ? "Collapse study design" : "Expand study design"}</span>
        </button>
      </div>

      {open && (
        <>
          <div className="border-t p-5">
            <FieldLabel>
              Segments studied · {brief.segments.length} · one planner per segment
            </FieldLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {brief.segments.map((s) => (
                <div key={s.name} className="rounded-lg border p-3">
                  <p className="text-xs font-medium">{s.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {s.description}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/80">
                    <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
                      Why studied ·{" "}
                    </span>
                    {s.whyRelevant}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 border-t p-5 lg:grid-cols-3">
            <div>
              <FieldLabel>Key assumptions</FieldLabel>
              <ul className="mt-2 space-y-1.5">
                {brief.keyAssumptions.map((a) => (
                  <li key={a} className="flex gap-2 text-[11px] leading-relaxed text-foreground/85">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/70" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <FieldLabel>Risk dimensions</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-1">
                {brief.riskDimensions.map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px] font-normal">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Ambiguities</FieldLabel>
              {brief.ambiguities.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {brief.ambiguities.map((a) => (
                    <li
                      key={a}
                      className="flex gap-2 text-[11px] leading-relaxed text-foreground/85"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">None flagged.</p>
              )}
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <FieldLabel>Clarity</FieldLabel>
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    {clarity}
                    <span className="font-normal text-muted-foreground">/100</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary/15">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${clarity}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
