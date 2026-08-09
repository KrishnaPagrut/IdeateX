"use client";

/**
 * The live simulation screen: three strategies racing against one audience.
 *
 * Consumes the SSE stream from /api/simulate and fans frames out by strategy.
 * Everything animates from the same event stream — graph activation, feeds,
 * narrative labels, and score bars — so the three views stay in lockstep.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { AudienceGraph, type GraphPersona } from "./AudienceGraph";
import type { AudienceCohort, Narrative, SimEvent, StrategyScores } from "@/lib/schemas";

type StrategyMeta = { id: string; name: string; theme: string; accent: string };

type Frame = {
  tick: number;
  totalTicks: number;
  scores: StrategyScores;
  cohortState: Array<{ cohortId: string; reached: number; population: number; sentiment: number; purchaseIntent: number }>;
  narratives: Narrative[];
  activatedPersonaIds: string[];
  events: SimEvent[];
  posts: Array<{ id: string; authorId: string | null; body: string; sentiment: number; isBrand: boolean }>;
};

const AXES: Array<{ key: keyof StrategyScores; label: string; lowerIsBetter?: boolean }> = [
  { key: "reach", label: "Reach" },
  { key: "trust", label: "Trust" },
  { key: "messageComprehension", label: "Comprehension" },
  { key: "purchaseIntent", label: "Purchase intent" },
  { key: "sharePropensity", label: "Share propensity" },
  { key: "controversy", label: "Controversy" },
  { key: "audienceFit", label: "Audience fit" },
  { key: "brandSafetyRisk", label: "Brand-safety risk", lowerIsBetter: true },
];

export function SimulationView({
  campaignId,
  onComplete,
}: {
  campaignId: string;
  onComplete: (results: any[]) => void;
}) {
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [cohorts, setCohorts] = useState<AudienceCohort[]>([]);
  const [personas, setPersonas] = useState<GraphPersona[]>([]);
  const [edges, setEdges] = useState<Array<{ from: string; to: string; weight: number }>>([]);
  const [frames, setFrames] = useState<Record<string, Frame>>({});
  const [feeds, setFeeds] = useState<Record<string, Array<{ id: string; handle: string; body: string; sentiment: number; llm: boolean }>>>({});
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const personaById = useRef<Map<string, GraphPersona>>(new Map());

  const start = useCallback(() => {
    setStatus("running");
    setFrames({});
    setFeeds({});
    setError(null);

    const es = new EventSource(`/api/simulate?campaignId=${campaignId}`);

    es.addEventListener("start", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setStrategies(d.strategies);
      setCohorts(d.cohorts);
      setPersonas(d.personas);
      setEdges(d.edges);
      personaById.current = new Map(d.personas.map((p: GraphPersona) => [p.id, p]));
    });

    es.addEventListener("tick", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Frame & { strategyId: string };
      setFrames((prev) => ({ ...prev, [d.strategyId]: d }));

      // Replies become feed entries. Keep the newest 14 per strategy.
      const replies = d.events.filter((ev) => ev.type === "reply" && ev.body);
      if (replies.length) {
        setFeeds((prev) => {
          const cur = prev[d.strategyId] ?? [];
          const added = replies.map((ev) => ({
            id: ev.id,
            handle: personaById.current.get(ev.personaId)?.handle ?? ev.personaId,
            body: ev.body!,
            sentiment: ev.sentiment,
            llm: ev.llmBacked,
          }));
          return { ...prev, [d.strategyId]: [...added.reverse(), ...cur].slice(0, 14) };
        });
      }
    });

    es.addEventListener("complete", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setStatus("done");
      es.close();
      onComplete(d.results);
    });

    es.addEventListener("error", (e) => {
      const raw = (e as MessageEvent).data;
      setError(raw ? JSON.parse(raw).message : "connection lost");
      setStatus("error");
      es.close();
    });

    es.onerror = () => {
      // Fires on normal close too; only treat as an error if we never finished.
      setStatus((s) => (s === "running" ? "error" : s));
      es.close();
    };
  }, [campaignId, onComplete]);

  const cohortColors = useMemo(
    () => Object.fromEntries(cohorts.map((c) => [c.id, c.color])),
    [cohorts],
  );

  const progress = useMemo(() => {
    const f = Object.values(frames)[0];
    return f ? f.tick / f.totalTicks : 0;
  }, [frames]);

  const activatedUnion = useMemo(() => {
    const s = new Set<string>();
    Object.values(frames).forEach((f) => f.activatedPersonaIds.forEach((id) => s.add(id)));
    return s;
  }, [frames]);

  if (status === "idle") {
    return (
      <div className="panel flex flex-col items-center justify-center gap-4 py-16">
        <div className="text-center">
          <h3 className="text-[17px] font-semibold">Run all three strategies against the same audience</h3>
          <p className="mt-1.5 max-w-[460px] text-[13.5px] text-[var(--muted)]">
            Identical starting conditions, identical population. The only variable is the strategy.
          </p>
        </div>
        <button className="btn btn-primary" onClick={start}>
          Run simulation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress + graph */}
      <div className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Synthetic audience
            </h3>
            <span className="mono text-[11px] text-[var(--faint)]">
              {activatedUnion.size}/{personas.length} reached
            </span>
          </div>
          <div className="flex items-center gap-3">
            {cohorts.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>
        </div>

        <AudienceGraph
          personas={personas}
          edges={edges}
          cohortColors={cohortColors}
          activated={activatedUnion}
          height={280}
        />

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-[var(--muted)]">
          <span>
            {status === "running" ? "Simulating…" : status === "done" ? "Complete" : "Error"}
          </span>
          <span className="mono">
            tick {Object.values(frames)[0]?.tick ?? 0} / {Object.values(frames)[0]?.totalTicks ?? 24}
          </span>
        </div>
        {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-3 gap-4">
        {strategies.map((s) => {
          const f = frames[s.id];
          const feed = feeds[s.id] ?? [];
          return (
            <div key={s.id} className="panel overflow-hidden">
              <div className="border-b border-[var(--line)] px-4 py-3" style={{ borderTop: `2px solid ${s.accent}` }}>
                <div className="flex items-center justify-between">
                  <h4 className="text-[14.5px] font-semibold">{s.name}</h4>
                  <span className="mono text-[10.5px] uppercase text-[var(--faint)]">{s.theme.replace("_", " ")}</span>
                </div>
              </div>

              {/* Scores */}
              <div className="space-y-1.5 px-4 py-3">
                {AXES.map((a) => {
                  const v = f?.scores[a.key] ?? 0;
                  return (
                    <div key={a.key} className="flex items-center gap-2.5">
                      <span className="w-[108px] shrink-0 text-[11.5px] text-[var(--muted)]">{a.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${v}%`,
                            background: a.lowerIsBetter
                              ? v > 45
                                ? "var(--neg)"
                                : "var(--faint)"
                              : s.accent,
                          }}
                        />
                      </div>
                      <span className="mono w-6 shrink-0 text-right text-[11px] text-[var(--ink)]">{v}</span>
                    </div>
                  );
                })}
              </div>

              {/* Narratives */}
              <div className="border-t border-[var(--line)] px-4 py-3">
                <div className="label mb-2">Emerging narratives</div>
                <div className="flex flex-wrap gap-1.5">
                  {(f?.narratives ?? []).slice(0, 4).map((n) => (
                    <span
                      key={n.id}
                      className="slide-in rounded-md px-2 py-1 text-[11.5px]"
                      style={{
                        background: n.sentiment >= 0 ? "rgb(15 138 77 / 0.10)" : "rgb(208 52 44 / 0.10)",
                        color: n.sentiment >= 0 ? "var(--pos)" : "var(--neg)",
                      }}
                    >
                      {n.label}
                      <span className="mono ml-1.5 opacity-60">{n.momentum.toFixed(0)}</span>
                    </span>
                  ))}
                  {!f?.narratives.length && (
                    <span className="text-[12px] text-[var(--faint)]">none yet</span>
                  )}
                </div>
              </div>

              {/* Live feed */}
              <div className="border-t border-[var(--line)]">
                <div className="label px-4 pt-3">Live feed</div>
                <div className="scroll-thin h-[210px] space-y-2 overflow-y-auto px-4 pb-3 pt-2">
                  {feed.map((r) => (
                    <div key={r.id} className="slide-in panel-2 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="mono text-[11px] text-[var(--muted)]">@{r.handle}</span>
                        {r.llm && (
                          <span
                            className="rounded px-1 text-[9px] font-semibold uppercase text-[var(--accent)]"
                            style={{ background: "var(--accent-soft)" }}
                            title="This reaction was generated by Grok rather than the deterministic path"
                          >
                            grok
                          </span>
                        )}
                        <span
                          className="ml-auto h-1.5 w-1.5 rounded-full"
                          style={{ background: r.sentiment >= 0 ? "var(--pos)" : "var(--neg)" }}
                        />
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-[var(--ink-2)]">{r.body}</p>
                    </div>
                  ))}
                  {!feed.length && (
                    <p className="pt-6 text-center text-[12px] text-[var(--faint)]">waiting for replies…</p>
                  )}
                </div>
              </div>

              {/* Cohort breakdown */}
              <div className="border-t border-[var(--line)] px-4 py-3">
                <div className="label mb-2">Cohort reception</div>
                <div className="space-y-1">
                  {(f?.cohortState ?? []).map((c) => {
                    const cohort = cohorts.find((x) => x.id === c.cohortId);
                    return (
                      <div key={c.cohortId} className="flex items-center gap-2 text-[11.5px]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cohort?.color }} />
                        <span className="flex-1 truncate text-[var(--muted)]">{cohort?.name}</span>
                        <span
                          className="mono"
                          style={{ color: c.sentiment >= 0.1 ? "var(--pos)" : c.sentiment <= -0.1 ? "var(--neg)" : "var(--muted)" }}
                        >
                          {c.sentiment >= 0 ? "+" : ""}
                          {c.sentiment.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11.5px] text-[var(--faint)]">
        Comparative synthetic scores under identical starting conditions — for ranking strategies
        against each other, not forecasting real-world performance.
      </p>
    </div>
  );
}
