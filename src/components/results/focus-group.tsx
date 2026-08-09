import { ArrowRight } from "lucide-react";

import { PersonaAvatar } from "@/components/run-live/persona-avatar";
import { cn } from "@/lib/utils";
import type { AgentRunSnapshot, PersonaLite } from "@/components/run-live/types";
import type { DiscussionOutput } from "@/lib/schemas/discussion";
import type { Verdict } from "@/lib/schemas/verdict";

// ---------------------------------------------------------------------------
// Focus-group section: what happened when personas heard their segment peers.
// A discussion agent_run's parent is the persona's ORIGINAL simulation run, so
// original→updated adoption pairs come from parent.output.adoptionLikelihood
// vs DiscussionOutput.updatedAdoptionLikelihood. Renders nothing when the run
// had no discussion stage.
// ---------------------------------------------------------------------------

interface DiscussionRow {
  agentId: string;
  out: DiscussionOutput;
  persona: PersonaLite | null;
  segment: string | null;
  /** Adoption before the group; null when the parent run's verdict is missing. */
  original: number | null;
  delta: number | null;
}

export function hasFocusGroup(agents: AgentRunSnapshot[]): boolean {
  return agents.some(
    (a) => a.kind === "discussion" && a.status === "completed" && a.output != null,
  );
}

function collectRows(
  agents: AgentRunSnapshot[],
  personas: Record<string, PersonaLite>,
): DiscussionRow[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  return agents
    .filter((a) => a.kind === "discussion" && a.status === "completed" && a.output != null)
    .map((a) => {
      const out = a.output as DiscussionOutput;
      const parent = a.parentAgentRunId ? byId.get(a.parentAgentRunId) : undefined;
      const parentOut = parent?.output as Partial<Verdict> | null | undefined;
      const original =
        typeof parentOut?.adoptionLikelihood === "number" ? parentOut.adoptionLikelihood : null;
      return {
        agentId: a.id,
        out,
        persona: a.personaId ? (personas[a.personaId] ?? null) : null,
        segment: a.segment ?? parent?.segment ?? null,
        original,
        delta: original !== null ? out.updatedAdoptionLikelihood - original : null,
      };
    });
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function DeltaTag({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        value > 0 ? "text-primary" : value < 0 ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {value > 0 ? "+" : ""}
      {round1(value)}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function ExchangeCard({
  row,
  onSelect,
}: {
  row: DiscussionRow;
  onSelect?: (agentRunId: string) => void;
}) {
  const { out, persona } = row;
  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        {persona ? (
          <PersonaAvatar seed={persona.avatarSeed} size={28} />
        ) : (
          <span className="size-7 shrink-0 rounded-full bg-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {persona?.name ?? "Unknown persona"}
          </span>
          <span className="block truncate font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
            {persona?.archetype ?? ""}
            {row.segment ? `${persona?.archetype ? " · " : ""}${row.segment}` : ""}
          </span>
        </span>
        <span
          className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums"
          title="Adoption likelihood before → after the focus group"
        >
          <span className="text-muted-foreground">{row.original}</span>
          <ArrowRight className="size-3 text-muted-foreground/60" />
          <span className="font-semibold">{out.updatedAdoptionLikelihood}</span>
          {row.delta !== null && row.delta !== 0 && (
            <DeltaTag value={row.delta} className="text-[11px]" />
          )}
        </span>
      </div>

      <blockquote className="mt-3 text-[13px] leading-relaxed text-foreground/95 italic">
        &ldquo;{out.reaction}&rdquo;
      </blockquote>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-mono text-[9px] tracking-widest uppercase">Key point heard · </span>
        {out.keyPointHeard}
      </p>

      {(out.changedMind || out.agreesWith.length > 0 || out.disagreesWith.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {out.changedMind && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-primary uppercase">
              Changed mind
            </span>
          )}
          {out.agreesWith.map((n) => (
            <span
              key={`a-${n}`}
              className="rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] text-foreground/85"
              title={`Sided with ${n}`}
            >
              <span className="font-mono text-[9px] text-primary">with</span> {n}
            </span>
          ))}
          {out.disagreesWith.map((n) => (
            <span
              key={`d-${n}`}
              className="rounded-full border border-destructive/25 bg-destructive/5 px-2 py-0.5 text-[10px] text-foreground/85"
              title={`Pushed back on ${n}`}
            >
              <span className="font-mono text-[9px] text-destructive">against</span> {n}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return onSelect ? (
    <article className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => onSelect(row.agentId)}
        className="w-full rounded-xl p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        {inner}
      </button>
    </article>
  ) : (
    <article className="rounded-xl border bg-card p-4">{inner}</article>
  );
}

export function FocusGroup({
  agents,
  personas,
  onSelect,
}: {
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
  /** Optional: clicking an exchange opens that discussion agent in the inspector. */
  onSelect?: (agentRunId: string) => void;
}) {
  const rows = collectRows(agents, personas);
  if (rows.length === 0) return null;

  const changed = rows.filter((r) => r.out.changedMind).length;
  const paired = rows.filter((r): r is DiscussionRow & { original: number; delta: number } =>
    r.original !== null,
  );
  const before = paired.length > 0 ? round1(mean(paired.map((r) => r.original))) : null;
  const after =
    paired.length > 0 ? round1(mean(paired.map((r) => r.out.updatedAdoptionLikelihood))) : null;
  const shift = before !== null && after !== null ? round1(after - before) : null;

  // Per-segment shift, shown only when the group actually spans segments.
  const segments = new Map<string, Array<DiscussionRow & { original: number; delta: number }>>();
  for (const r of paired) {
    const key = r.segment ?? "Unsegmented";
    const list = segments.get(key);
    if (list) list.push(r);
    else segments.set(key, [r]);
  }

  const exchanges = [...paired].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <FieldLabel>Minds changed</FieldLabel>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {changed}
              <span className="text-sm font-normal text-muted-foreground">/{rows.length}</span>
            </p>
          </div>
          {before !== null && after !== null && shift !== null && (
            <div>
              <FieldLabel>Mean adoption · before → after the group</FieldLabel>
              <p className="mt-1 flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums">
                <span className="font-normal text-muted-foreground">{before}</span>
                <ArrowRight className="size-4 self-center text-muted-foreground/60" />
                {after}
                <DeltaTag value={shift} className="text-sm" />
              </p>
            </div>
          )}
        </div>

        {segments.size > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
            {[...segments.entries()].map(([seg, list]) => {
              const b = round1(mean(list.map((r) => r.original)));
              const a = round1(mean(list.map((r) => r.out.updatedAdoptionLikelihood)));
              return (
                <span
                  key={seg}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tabular-nums"
                >
                  <span className="max-w-40 truncate tracking-wider uppercase">{seg}</span>
                  <span className="text-muted-foreground">{b}</span>
                  <ArrowRight className="size-2.5 text-muted-foreground/60" />
                  <span className="font-semibold">{a}</span>
                  {round1(a - b) !== 0 && <DeltaTag value={round1(a - b)} />}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {exchanges.length > 0 && (
        <div>
          <FieldLabel>Most consequential exchanges · biggest score moves</FieldLabel>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {exchanges.map((r) => (
              <ExchangeCard key={r.agentId} row={r} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
