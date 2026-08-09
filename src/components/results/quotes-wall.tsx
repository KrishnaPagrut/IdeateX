import { PersonaAvatar } from "@/components/run-live/persona-avatar";
import type { AgentRunSnapshot, PersonaLite } from "@/components/run-live/types";
import type { Verdict } from "@/lib/schemas/verdict";

// ---------------------------------------------------------------------------
// The population speaks: every completed persona's verbatim reaction as a
// masonry wall of cards, each tagged with who said it and their adoption score.
// ---------------------------------------------------------------------------

interface QuoteEntry {
  agentId: string;
  quote: string;
  adoption: number;
  emotion: string;
  persona: PersonaLite | null;
  segment: string | null;
}

export function QuotesWall({
  agents,
  personas,
  onSelect,
}: {
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
  /** Optional: clicking a card opens that persona agent in the inspector. */
  onSelect?: (agentRunId: string) => void;
}) {
  const entries: QuoteEntry[] = agents
    .filter((a) => a.kind === "persona" && a.status === "completed" && a.output != null)
    .map((a) => {
      const v = a.output as Verdict;
      return {
        agentId: a.id,
        quote: v.verbatimQuote,
        adoption: v.adoptionLikelihood,
        emotion: v.emotionalReaction,
        persona: a.personaId ? (personas[a.personaId] ?? null) : null,
        segment: a.segment ?? null,
      };
    })
    .sort((a, b) => b.adoption - a.adoption);

  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-medium">In their own words</h3>
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          {entries.length} verbatim reactions · sorted by adoption
        </p>
      </header>
      <div className="columns-1 gap-3 sm:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {entries.map((e) => {
          const inner = (
            <>
              <blockquote className="text-[13px] leading-relaxed text-foreground/95 italic">
                &ldquo;{e.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-3 flex items-center gap-2 border-t pt-2.5">
                {e.persona ? (
                  <PersonaAvatar seed={e.persona.avatarSeed} size={26} />
                ) : (
                  <span className="size-[26px] shrink-0 rounded-full bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium not-italic">
                    {e.persona?.name ?? "Unknown persona"}
                  </span>
                  <span className="block truncate font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                    {e.persona?.archetype ?? e.segment ?? ""}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
                  title={`Adoption likelihood ${e.adoption}/100 · ${e.emotion}`}
                >
                  {e.adoption}
                </span>
              </figcaption>
            </>
          );
          return onSelect ? (
            <figure key={e.agentId} className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => onSelect(e.agentId)}
                className="w-full rounded-xl p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                {inner}
              </button>
            </figure>
          ) : (
            <figure key={e.agentId} className="rounded-xl border bg-card p-4">
              {inner}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
