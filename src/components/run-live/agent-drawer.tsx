"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight, Quote } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DotmSquare4 } from "@/components/ui/dotm-square-4";
import type { AgentStatus } from "@/lib/db/schema";
import type { Brief } from "@/lib/schemas/brief";
import type { CastingPlan, CastingSpec } from "@/lib/schemas/casting";
import type { Critique } from "@/lib/schemas/critique";
import type { DiscussionOutput } from "@/lib/schemas/discussion";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { Verdict } from "@/lib/schemas/verdict";

import { PersonaAvatar } from "./persona-avatar";
import type { AgentRunSnapshot, PersonaLite } from "./types";

// ---------------------------------------------------------------------------
// Inspector drawer: the legibility core. Every agent's prompt, output, tokens
// and cost, with the structured output pretty-rendered per agent kind.
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<AgentStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-primary text-primary-foreground animate-pulse" },
  completed: { label: "Completed", className: "bg-secondary text-secondary-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground" },
};

function formatDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function formatCost(costUsd: string | null): string | null {
  if (costUsd == null) return null;
  const n = Number(costUsd);
  return Number.isFinite(n) ? `$${n.toFixed(4)}` : null;
}

// --- small building blocks --------------------------------------------------

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{children}</p>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="truncate font-mono text-xs tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** 0–100 meter: fill carries the value, track is a lighter step of the same ink. */
function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-medium tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary/15">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }}
        />
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: "low" | "medium" | "high" }) {
  return (
    <Badge
      variant={severity === "high" ? "destructive" : severity === "medium" ? "outline" : "secondary"}
      className="font-mono text-[9px] tracking-widest uppercase"
    >
      {severity}
    </Badge>
  );
}

function Collapsible({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="flex-1 font-mono text-[10px] tracking-widest text-foreground uppercase">{title}</span>
        {meta && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{meta}</span>}
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {children}
        </pre>
      )}
    </div>
  );
}

function PullQuote({ quote }: { quote: string }) {
  return (
    <figure className="relative rounded-lg border-l-2 border-primary bg-secondary/50 py-3 pr-3 pl-4">
      <Quote className="absolute top-2 right-2 size-3.5 text-muted-foreground/40" />
      <blockquote className="text-sm leading-relaxed text-foreground italic">&ldquo;{quote}&rdquo;</blockquote>
    </figure>
  );
}

function ListSection({ title, items, tone }: { title: string; items: string[]; tone?: "destructive" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed">
            <span
              className={cn(
                "mt-1.5 size-1 shrink-0 rounded-full",
                tone === "destructive" ? "bg-destructive" : "bg-primary",
              )}
            />
            <span className="text-foreground/90">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- per-kind output renderers ----------------------------------------------

function VerdictOutput({ verdict }: { verdict: Verdict }) {
  const wtp = verdict.willingnessToPay;
  return (
    <div className="space-y-4">
      <PullQuote quote={verdict.verbatimQuote} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Meter label="Adoption likelihood" value={verdict.adoptionLikelihood} />
        <Meter label="Self-reported confidence" value={verdict.confidence} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Would pay"
          value={
            wtp === null
              ? "n/a"
              : wtp.amount === 0
                ? "$0"
                : `$${wtp.amount} ${wtp.cadence.replace("_", "-")}`
          }
        />
        <Stat label="Reaction" value={verdict.emotionalReaction} />
        <Stat label="Recommends" value={verdict.wouldRecommend ? "yes" : "no"} />
      </div>
      <ListSection title="Objections" items={verdict.topObjections} />
      <ListSection title="Deal breakers" items={verdict.dealBreakers} tone="destructive" />
      <ListSection title="Delighters" items={verdict.delighters} />
    </div>
  );
}

function CastingSpecOutput({ spec }: { spec: CastingSpec }) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Casting rationale</Eyebrow>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{spec.rationale}</p>
      </div>
      <div>
        <Eyebrow>Casting contract · {spec.requests.reduce((n, r) => n + r.count, 0)} people requested</Eyebrow>
        <ul className="mt-2 space-y-2">
          {spec.requests.map((request, i) => (
            <li key={i} className="rounded-lg border p-2.5">
              <p className="flex items-baseline gap-2 text-xs font-medium">
                <span className="font-mono text-[10px] tracking-wider text-primary uppercase">
                  {request.pool}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  ×{request.count}
                </span>
              </p>
              {request.mustInclude.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {request.mustInclude.map((label) => (
                    <Badge key={label} variant="outline" className="text-[9px]">
                      {label}
                    </Badge>
                  ))}
                </p>
              )}
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{request.angle}</p>
              {request.probeQuestions.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {request.probeQuestions.map((q) => (
                    <li key={q} className="text-[11px] leading-relaxed text-foreground/80">
                      — {q}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CastingOutput({
  plan,
  personas,
}: {
  plan: CastingPlan;
  personas: Record<string, PersonaLite>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Casting rationale</Eyebrow>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{plan.rationale}</p>
      </div>
      <div>
        <Eyebrow>Cast · {plan.picks.length} personas</Eyebrow>
        <ul className="mt-2 space-y-2">
          {plan.picks.map((pick) => {
            const persona = personas[pick.personaId];
            return (
              <li key={pick.personaId} className="flex gap-2.5 rounded-lg border p-2.5">
                {persona ? (
                  <PersonaAvatar seed={persona.avatarSeed} size={24} />
                ) : (
                  <span className="size-6 shrink-0 rounded-full bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {persona?.name ?? pick.personaId}
                    {persona && (
                      <span className="ml-1.5 font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                        {persona.archetype}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{pick.angle}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function BriefOutput({ brief }: { brief: Brief }) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Idea summary</Eyebrow>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{brief.ideaSummary}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Category" value={brief.category} />
        <Stat label="Clarity" value={`${brief.clarityScore}/100`} />
      </div>
      <div>
        <Eyebrow>Segments to study · {brief.segments.length}</Eyebrow>
        <ul className="mt-2 space-y-2">
          {brief.segments.map((s) => (
            <li key={s.name} className="rounded-lg border p-2.5">
              <p className="text-xs font-medium">{s.name}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.description}</p>
            </li>
          ))}
        </ul>
      </div>
      <ListSection title="Key assumptions" items={brief.keyAssumptions} />
      <ListSection title="Risk dimensions" items={brief.riskDimensions} tone="destructive" />
      <ListSection title="Ambiguities" items={brief.ambiguities} />
    </div>
  );
}

function CritiqueOutput({ critique }: { critique: Critique }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Stance" value={critique.stance === "redteam" ? "red team" : critique.stance} />
        <Stat label="Adjusted confidence" value={`${critique.adjustedConfidence}/100`} />
      </div>
      <div>
        <Eyebrow>Findings</Eyebrow>
        <ul className="mt-2 space-y-2">
          {critique.findings.map((f) => (
            <li key={f.claim} className="rounded-lg border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium">{f.claim}</p>
                <SeverityChip severity={f.severity} />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{f.evidence}</p>
            </li>
          ))}
        </ul>
      </div>
      <ListSection title="Bias warnings" items={critique.biasWarnings} tone="destructive" />
      <ListSection title="Contrary evidence" items={critique.contraryEvidence} />
    </div>
  );
}

function SynthesisOutput({ synthesis }: { synthesis: Synthesis }) {
  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Verdict</Eyebrow>
        <p className="mt-1 font-mono text-sm font-semibold tracking-wide uppercase">
          {synthesis.verdict.replaceAll("_", " ")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{synthesis.oneLiner}</p>
      </div>
      <div className="space-y-2.5">
        <Meter label="Desirability" value={synthesis.scores.desirability} />
        <Meter label="Viability" value={synthesis.scores.viability} />
        <Meter label="Urgency" value={synthesis.scores.urgency} />
        <Meter label="Confidence" value={synthesis.confidence} />
      </div>
      <ListSection title="Key findings" items={synthesis.keyFindings.map((f) => f.title)} />
      <ListSection title="Top risks" items={synthesis.topRisks.map((r) => r.risk)} tone="destructive" />
      <div>
        <Eyebrow>Boldest bet</Eyebrow>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{synthesis.boldestBet}</p>
      </div>
    </div>
  );
}

function DiscussionOutputSection({ reply }: { reply: DiscussionOutput }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-secondary/40 p-3">
        <Quote className="size-3 text-muted-foreground" aria-hidden />
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/90 italic">{reply.reaction}</p>
      </div>
      <div className="flex items-center gap-2">
        <Eyebrow>After the group</Eyebrow>
        <span className="font-mono text-xs tabular-nums">
          adoption → {reply.updatedAdoptionLikelihood}/100
        </span>
        {reply.changedMind && (
          <Badge variant="outline" className="font-mono text-[9px] tracking-wider uppercase">
            changed mind
          </Badge>
        )}
      </div>
      <div>
        <Eyebrow>Key point heard</Eyebrow>
        <p className="mt-1 text-xs leading-relaxed text-foreground/90">{reply.keyPointHeard}</p>
      </div>
      {reply.agreesWith.length > 0 && <ListSection title="Sided with" items={reply.agreesWith} />}
      {reply.disagreesWith.length > 0 && (
        <ListSection title="Pushed back on" items={reply.disagreesWith} tone="destructive" />
      )}
    </div>
  );
}

function OutputSection({
  agent,
  personas,
}: {
  agent: AgentRunSnapshot;
  personas: Record<string, PersonaLite>;
}) {
  if (agent.output == null) {
    return <p className="text-xs text-muted-foreground">No output recorded.</p>;
  }
  if (typeof agent.output !== "object") {
    return (
      <pre className="max-h-80 overflow-auto rounded-lg border bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {JSON.stringify(agent.output, null, 2)}
      </pre>
    );
  }
  switch (agent.kind) {
    case "persona":
      return <VerdictOutput verdict={agent.output as Verdict} />;
    case "planner":
      // Casting contracts (v2, pool requests) vs legacy id-pick plans.
      return Array.isArray((agent.output as { requests?: unknown }).requests) ? (
        <CastingSpecOutput spec={agent.output as CastingSpec} />
      ) : (
        <CastingOutput plan={agent.output as CastingPlan} personas={personas} />
      );
    case "framing":
      return <BriefOutput brief={agent.output as Brief} />;
    case "discussion":
      return <DiscussionOutputSection reply={agent.output as DiscussionOutput} />;
    case "critique":
      return <CritiqueOutput critique={agent.output as Critique} />;
    case "synthesis":
      return <SynthesisOutput synthesis={agent.output as Synthesis} />;
    default:
      return (
        <pre className="max-h-80 overflow-auto rounded-lg border bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(agent.output, null, 2)}
        </pre>
      );
  }
}

// --- persona character card -------------------------------------------------

function TraitDots({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="flex gap-0.5" aria-label={`${label}: ${value} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full", i <= value ? "bg-primary" : "bg-primary/15")}
          />
        ))}
      </span>
    </div>
  );
}

function PersonaCard({ persona }: { persona: PersonaLite }) {
  const d = persona.demographics;
  const p = persona.psychographics;
  return (
    <div className="rounded-lg border bg-secondary/30 p-3">
      <div className="flex items-center gap-2.5">
        <PersonaAvatar seed={persona.avatarSeed} size={36} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{persona.name}</p>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {persona.archetype}
          </p>
        </div>
      </div>
      {d && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {d.age} · {d.occupation} · {d.location} · {d.incomeBand}
        </p>
      )}
      {persona.backstory && (
        <p className="mt-2 text-[11px] leading-relaxed text-foreground/85">{persona.backstory}</p>
      )}
      {p && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <TraitDots label="Tech savvy" value={p.techSavviness} />
          <TraitDots label="Risk tolerance" value={p.riskTolerance} />
          <TraitDots label="Price sensitivity" value={p.priceSensitivity} />
          <TraitDots label="Openness" value={p.openness} />
        </div>
      )}
      {p && p.values.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {p.values.map((v) => (
            <Badge key={v} variant="outline" className="text-[10px]">
              {v}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// --- drawer -----------------------------------------------------------------

const DOT_STYLE = { "--color-dot-on": "var(--primary)" } as CSSProperties;

export function AgentDrawer({
  agent,
  persona,
  personas,
  onClose,
}: {
  /** Full agent run row, or null when the drawer is closed. */
  agent: AgentRunSnapshot | null;
  /** Persona attached to this agent, when kind = persona. */
  persona?: PersonaLite | null;
  /** Persona lookup used to resolve casting-plan picks. */
  personas?: Record<string, PersonaLite>;
  onClose: () => void;
}) {
  const running = agent?.status === "running" || agent?.status === "pending";
  const duration = agent ? formatDuration(agent.startedAt, agent.finishedAt) : null;
  const cost = agent ? formatCost(agent.costUsd) : null;

  return (
    <Sheet open={agent !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:sm:max-w-lg"
        aria-describedby={undefined}
      >
        {agent && (
          <>
            <SheetHeader className="border-b pr-12">
              <Eyebrow>
                {agent.kind}
                {agent.segment ? ` · ${agent.segment}` : ""}
              </Eyebrow>
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate">{agent.label}</SheetTitle>
                <Badge className={cn("font-mono text-[9px] tracking-widest uppercase", STATUS_BADGE[agent.status].className)}>
                  {STATUS_BADGE[agent.status].label}
                </Badge>
              </div>
              <SheetDescription className="sr-only">Agent run details</SheetDescription>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <Stat label="Model" value={agent.model ?? "—"} />
                <Stat label="Duration" value={duration ?? "—"} />
                <Stat label="Cost" value={cost ?? "—"} />
                <Stat
                  label="Tokens"
                  value={
                    agent.inputTokens != null
                      ? `${agent.inputTokens.toLocaleString()} → ${(agent.outputTokens ?? 0).toLocaleString()}`
                      : "—"
                  }
                />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {persona && <PersonaCard persona={persona} />}

              {agent.systemPrompt && (
                <Collapsible title="System prompt" meta={`${agent.systemPrompt.length} chars`}>
                  {agent.systemPrompt}
                </Collapsible>
              )}
              {agent.userPrompt && (
                <Collapsible title="Input" meta={`${agent.userPrompt.length} chars`}>
                  {agent.userPrompt}
                </Collapsible>
              )}

              <Separator />

              {agent.status === "failed" ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <Eyebrow>Error</Eyebrow>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-destructive">
                    {agent.error ?? "Agent failed without an error message."}
                  </p>
                </div>
              ) : running ? (
                <div className="space-y-3" style={DOT_STYLE}>
                  <div className="flex items-center gap-2.5">
                    <DotmSquare4 size={24} dotSize={3} colorPreset="solid-theme" ariaLabel="Agent running" />
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                      {agent.status === "running" ? "Working — output streams in live" : "Queued"}
                    </p>
                  </div>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ) : (
                <div>
                  <Eyebrow>Output</Eyebrow>
                  <div className="mt-2">
                    <OutputSection agent={agent} personas={personas ?? {}} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
