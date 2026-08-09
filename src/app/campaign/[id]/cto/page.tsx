"use client";

/**
 * CTO workspace: build plan, dependency analysis, findings, draft artifacts.
 *
 * The Gantt-style chart is laid out by dependency depth rather than by date —
 * what matters here is what blocks what, not the calendar.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shell, ProviderBadge } from "@/components/Shell";
import { FindingsPanel } from "@/components/Findings";
import { DistributionChart, GradientText, Meter, Reveal, SectionLabel, Stat } from "@/components/ui";
import type { BuildAnalysis, BuildPlanDesign, EngTask, FindingsReport } from "@/lib/schemas";
import type { ScheduleSimulation } from "@/lib/cto/montecarlo";

type BuildPlanRecord = {
  plan: BuildPlanDesign;
  analysis: BuildAnalysis;
  simulation: ScheduleSimulation;
  findings: FindingsReport;
};

type Item = {
  id: string;
  kind: string;
  role: string;
  state: string;
  title: string;
  body: string;
  scheduledAt: string;
  purpose: string;
  hashtags: string[];
  version: number;
};

const AREA_COLOR: Record<string, string> = {
  infra: "#64748b",
  backend: "#3b82f6",
  frontend: "#a855f7",
  data: "#0ea5e9",
  auth: "#ef4444",
  integration: "#f59e0b",
  testing: "#10b981",
  ops: "#6366f1",
};

const KIND_LABEL: Record<string, string> = {
  eng_task: "Task",
  pr_draft: "PR draft",
  spike: "Spike",
  arch_note: "Arch note",
};

/** Dependency depth — how many hops from a task with no dependencies. */
function depthOf(task: EngTask, byId: Map<string, EngTask>, memo = new Map<string, number>()): number {
  const hit = memo.get(task.id);
  if (hit !== undefined) return hit;
  memo.set(task.id, 0); // guards against cycles
  const d = task.dependsOn.length
    ? 1 + Math.max(...task.dependsOn.map((id) => {
        const dep = byId.get(id);
        return dep ? depthOf(dep, byId, memo) : 0;
      }))
    : 0;
  memo.set(task.id, d);
  return d;
}

export default function CtoPage({ params }: { params: { id: string } }) {
  const [record, setRecord] = useState<BuildPlanRecord | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Item | null>(null);

  async function load() {
    const [c, p] = await Promise.all([
      fetch(`/api/campaign/${params.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/cto?companyId=${params.id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setCompany(c.campaign);
    setProvider(c.provider);
    setItems((c.items ?? []).filter((i: Item) => i.role === "cto"));
    setRecord(p.buildPlan ?? null);
    if (c.campaign?.brief?.objective && !objective) {
      setObjective(`Ship an MVP that achieves: ${c.campaign.brief.objective}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function run() {
    if (!objective.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: params.id, objective }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "CTO run failed");
    } finally {
      setBusy(false);
    }
  }

  const byId = useMemo(
    () => new Map((record?.plan.tasks ?? []).map((t) => [t.id, t])),
    [record],
  );

  const columns = useMemo(() => {
    if (!record) return [];
    const memo = new Map<string, number>();
    const groups = new Map<number, EngTask[]>();
    record.plan.tasks.forEach((t) => {
      const d = depthOf(t, byId, memo);
      const list = groups.get(d) ?? [];
      list.push(t);
      groups.set(d, list);
    });
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [record, byId]);

  const sim = record?.simulation;
  const onCritical = new Set(record?.analysis.criticalPath ?? []);
  const totalDays = (record?.plan.tasks ?? []).reduce((s, t) => s + t.estimateDays, 0);

  return (
    <Shell company={company?.brief?.productName} companyId={params.id} role="cto">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <><SectionLabel tone="var(--cto)">CTO</SectionLabel><h1 className="display mt-4 text-[2.25rem] sm:text-[2.75rem]">Simulate the build <GradientText>before you commit</GradientText>.</h1></>
          <p className="mt-3 max-w-[680px] text-[14px] leading-relaxed text-[var(--muted)]">
            Decomposes the objective into a task graph, runs thousands of Monte Carlo schedule
            simulations over it, and reports where the finish dates actually land. Every artifact is
            a draft — nothing is opened against a repository.
          </p>
        </div>
        <ProviderBadge live={provider?.live ?? false} name={provider?.name ?? "mock"} />
      </div>

      {/* Objective */}
      <div className="panel mb-5 p-4">
        <label className="label">Objective</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="field input-w flex-1"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Ship a working MVP in 8 weeks"
          />
          <button className="btn btn-primary shrink-0 sm:w-auto" onClick={run} disabled={busy || !objective.trim()}>
            {busy ? "Simulating…" : record ? <>Re-run simulation <span className="arrow">→</span></> : <>Run simulation <span className="arrow">→</span></>}
          </button>
        </div>
        {err && <p className="mt-2 text-[12.5px] text-red-600">{err}</p>}
      </div>

      {!record && !busy && (
        <div className="panel py-16 text-center">
          <p className="text-[15px] font-medium">No build plan yet</p>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            Give the CTO an objective. It will plan the work, simulate the schedule thousands of
            times, and tell you what date you can actually commit to.
          </p>
        </div>
      )}

      {record && sim && (
        <>
          {/*
            The simulation is the headline, not a footnote. An inverted band
            makes it the visual centre of the page and gives the distribution
            room to breathe.
          */}
          <Reveal className="mb-5">
            <section className="inverted dot-pattern p-7">
              <div className="relative z-10">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <SectionLabel live tone="#4d7cff">
                      Schedule simulation
                    </SectionLabel>
                    <h2 className="display mt-4 text-[2rem] text-white sm:text-[2.5rem]">
                      {Math.round((sim.targetProbability ?? 0) * 100)}% chance of shipping in{" "}
                      {Math.ceil(sim.deterministic)} days.
                    </h2>
                    <p className="mt-2 max-w-[560px] text-[13.5px] leading-relaxed text-white/55">
                      {sim.runs.toLocaleString()} simulated runs across the dependency graph, each
                      sampling every task&apos;s real duration from its risk profile.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-4">
                    <Stat invert label="P10" value={`${sim.p10}d`} />
                    <Stat invert label="P50" value={`${sim.p50}d`} />
                    <Stat invert label="P80" value={`${sim.p80}d`} tone="#fbbf24" />
                    <Stat invert label="P95" value={`${sim.p95}d`} tone="#f87171" />
                  </div>
                </div>

                <DistributionChart
                  bins={sim.histogram}
                  height={170}
                  markers={[
                    { at: sim.deterministic, label: "quoted", tone: "#f87171", dashed: true },
                    { at: sim.p50, label: "P50", tone: "#ffffff" },
                    { at: sim.p80, label: "P80", tone: "#fbbf24" },
                  ]}
                />

                <p className="mt-4 border-t border-white/10 pt-4 text-[13px] text-white/70">
                  Commit to{" "}
                  <strong className="font-semibold text-white">{Math.ceil(sim.p80)} days</strong>, not{" "}
                  {Math.ceil(sim.deterministic)}. Hold{" "}
                  <strong className="font-semibold text-white">
                    {Math.ceil(sim.p95 - sim.p50)} days
                  </strong>{" "}
                  of buffer for the tail.
                </p>
              </div>
            </section>
          </Reveal>

          {/* Supporting numbers */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Total work", value: `${totalDays.toFixed(0)}d`, sub: `${record.plan.tasks.length} tasks` },
              { label: "Critical path", value: `${record.analysis.criticalPathDays}d`, sub: `${record.analysis.criticalPath.length} sequential` },
              { label: "Parallel floor", value: `${record.analysis.parallelFloorDays}d`, sub: "unlimited people" },
              {
                label: "Always critical",
                value: `${sim.criticality.filter((c) => c.share >= 0.9).length}`,
                sub: "tasks in 90%+ of runs",
                tone: "var(--warn)",
              },
            ].map((s) => (
              <div key={s.label} className="panel panel-hover p-5">
                <Stat label={s.label} value={s.value} sub={s.sub} tone={s.tone} />
              </div>
            ))}
          </div>

          {/* Criticality — which tasks decide the date */}
          <Reveal className="mb-5">
            <div className="panel p-6">
              <SectionLabel>Criticality</SectionLabel>
              <h3 className="display mt-4 mb-1 text-[1.6rem]">
                Which tasks actually <GradientText>decide the date</GradientText>.
              </h3>
              <p className="mb-5 max-w-[680px] text-[13px] leading-relaxed text-[var(--muted)]">
                How often each task landed on the critical path across all runs. A task critical in
                90% of runs is a real risk; one critical in 20% is noise.
              </p>
              {/*
                Grid rather than flex: the label column grows with available
                space up to a sane cap, and the bar is width-capped, so neither
                one degenerates on a very wide display.
              */}
              <div className="space-y-2.5">
                {sim.criticality.map((c) => (
                  <div
                    key={c.taskId}
                    className="grid items-center gap-4"
                    style={{ gridTemplateColumns: "minmax(160px, 22rem) minmax(0, 34rem) 3rem" }}
                  >
                    <span className="truncate text-[13px]" title={byId.get(c.taskId)?.title}>
                      {byId.get(c.taskId)?.title ?? c.taskId}
                    </span>
                    <Meter
                      value={c.share * 100}
                      tone={c.share >= 0.9 ? "var(--neg)" : c.share >= 0.5 ? "var(--warn)" : "var(--accent)"}
                    />
                    <span className="mono text-right text-[12px]">
                      {Math.round(c.share * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Dependency graph, laid out by depth */}
          <div className="panel mb-5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Dependency graph — columns are what can run in parallel
              </h3>
              <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
                on critical path
              </span>
            </div>
            <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
              {columns.map(([depth, tasks]) => (
                <div key={depth} className="min-w-[210px] flex-1">
                  <div className="mono mb-2 text-[10.5px] uppercase text-[var(--faint)]">
                    stage {depth + 1}
                  </div>
                  <div className="space-y-2">
                    {tasks.map((t) => {
                      const crit = onCritical.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className="panel-2 p-2.5"
                          style={{
                            borderLeft: `3px solid ${AREA_COLOR[t.area] ?? "var(--faint)"}`,
                            outline: crit ? "1px solid var(--accent)" : "none",
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="mono text-[9.5px] uppercase text-[var(--faint)]">
                              {t.area}
                            </span>
                            <span className="mono ml-auto text-[10px] text-[var(--muted)]">
                              {t.estimateDays}d
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] font-medium leading-snug">{t.title}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${t.risk * 100}%`,
                                  background: t.risk >= 0.55 ? "var(--neg)" : t.risk >= 0.35 ? "var(--warn)" : "var(--faint)",
                                }}
                              />
                            </div>
                            <span className="mono text-[9.5px] text-[var(--faint)]">
                              {(t.risk * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Findings */}
          <div className="mb-5">
            <FindingsPanel report={record.findings} headline="What the analysis found" />
          </div>

          {/* Artifacts */}
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="min-w-0 flex-1">
              <h3 className="label mb-3">
                Draft artifacts — {items.length} generated from the plan
              </h3>
              <div className="space-y-2">
                {items.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => setSel(i)}
                    className="panel flex w-full items-center gap-3 p-3 text-left"
                    style={{ outline: sel?.id === i.id ? "1px solid var(--accent)" : "none" }}
                  >
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        background: i.kind === "spike" ? "rgb(180 83 9 / 0.12)" : "var(--track)",
                        color: i.kind === "spike" ? "var(--warn)" : "var(--muted)",
                      }}
                    >
                      {KIND_LABEL[i.kind] ?? i.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{i.title}</p>
                      <p className="truncate text-[12px] text-[var(--muted)]">{i.purpose}</p>
                    </div>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: AREA_COLOR[i.hashtags[0]] ?? "var(--faint)" }}
                      title={i.hashtags[0]}
                    />
                  </button>
                ))}
              </div>
            </div>

            {sel && (
              <aside className="panel slide-in w-full shrink-0 self-start p-4 xl:w-[420px]">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <span className="mono text-[10px] uppercase text-[var(--faint)]">
                      {KIND_LABEL[sel.kind] ?? sel.kind}
                    </span>
                    <h3 className="text-[15px] font-semibold">{sel.title}</h3>
                  </div>
                  <button className="text-[var(--muted)] hover:text-black" onClick={() => setSel(null)}>
                    ✕
                  </button>
                </div>
                <div className="panel-2 mb-3 p-2.5">
                  <p className="text-[11.5px] leading-snug" style={{ color: "var(--accent)" }}>
                    <span className="text-[var(--faint)]">Why this exists: </span>
                    {sel.purpose}
                  </p>
                </div>
                <pre className="scroll-thin panel-2 max-h-[440px] overflow-auto p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
                  {sel.body}
                </pre>
                <p className="mt-3 text-[11.5px] text-[var(--faint)]">
                  Draft only — not opened against any repository.
                </p>
              </aside>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href={`/campaign/${params.id}`} className="btn">
              ← Back to company
            </Link>
            <Link href={`/campaign/${params.id}/cmo`} className="btn">
              Hand off to CMO →
            </Link>
          </div>
        </>
      )}
    </Shell>
  );
}
