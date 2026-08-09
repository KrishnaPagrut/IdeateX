"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, ProviderBadge } from "@/components/Shell";
import { SimulationView } from "@/components/SimulationView";
import { ImageSkeleton, useImageStream } from "@/components/useImageStream";
import type { CampaignStrategy, FindingsReport, SimulationResult } from "@/lib/schemas";

export default function CampaignPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [findings, setFindings] = useState<FindingsReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // no-store: campaign state changes as images stream in and items are
    // edited, so a cached response can show a stale campaign after reload.
    fetch(`/api/campaign/${params.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr("Could not load campaign"));
  }, [params.id]);

  // Kick off the image stream as soon as we know a strategy is missing a
  // visual. Declared before any early return so hook order stays stable.
  const needsImages = Boolean(
    data?.campaign?.strategies?.some((s: CampaignStrategy) => !s.representativeImage?.url),
  );
  const streamedImages = useImageStream(params.id, needsImages);

  const onSimComplete = useCallback(
    async (r: SimulationResult[]) => {
      try {
        const res = await fetch("/api/findings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: params.id, results: r }),
        });
        const d = await res.json();
        if (d.findings) {
          setFindings(d.findings);
          setSelected(d.findings.winningStrategyId);
        }
      } catch {
        setErr("Findings could not be derived");
      }
    },
    [params.id],
  );

  async function buildTimeline() {
    if (!selected || !findings) return;
    setBuilding(true);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: params.id, strategyId: selected, findings }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "failed");
      router.push(`/campaign/${params.id}/timeline`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Timeline generation failed");
      setBuilding(false);
    }
  }

  if (err && !data) {
    return (
      <Shell role="cmo" companyId={params.id}>
        <p className="text-red-600">{err}</p>
      </Shell>
    );
  }
  if (!data?.campaign) {
    return (
      <Shell role="cmo" companyId={params.id}>
        <p className="text-[var(--muted)]">Loading…</p>
      </Shell>
    );
  }

  const { campaign, provider } = data;
  const strategies: CampaignStrategy[] = campaign.strategies ?? [];

  return (
    <Shell role="cmo" companyId={params.id} company={campaign.brief.productName}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">{campaign.brief.productName}</h1>
          <p className="mt-1 max-w-[720px] text-[14px] text-[var(--muted)]">
            {campaign.brief.productDescription}
          </p>
        </div>
        <ProviderBadge live={provider?.live ?? false} name={provider?.name ?? "mock"} />
      </div>

      {/* Cohorts */}
      <section className="mb-6">
        <h2 className="label mb-3">
          Synthetic audience · {campaign.audience?.personas.length ?? 0} fictional personas across{" "}
          {campaign.audience?.cohorts.length ?? 0} cohorts
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(campaign.audience?.cohorts ?? []).map((c: any) => (
            <div key={c.id} className="panel p-4" style={{ borderTop: `2px solid ${c.color}` }}>
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">{c.name}</h3>
                <span className="mono text-[11px] text-[var(--muted)]">
                  {(c.populationShare * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--muted)]">{c.description}</p>
              <div className="mt-3 space-y-1">
                {(["skepticism", "influence", "humor"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-[62px] text-[10.5px] uppercase tracking-wide text-[var(--faint)]">{k}</span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
                      <div className="h-full rounded-full" style={{ width: `${c.baseline[k] * 100}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-[var(--faint)]">
                <span className="text-[var(--muted)]">Objects to:</span> {c.commonObjections.slice(0, 2).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Strategies */}
      <section className="mb-6">
        <h2 className="label mb-3">Three campaign strategies</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((s) => {
            const won = findings?.winningStrategyId === s.id;
            const isSel = selected === s.id;
            return (
              <button
                key={s.id}
                onClick={() => findings && setSelected(s.id)}
                className="panel p-4 text-left transition-all"
                style={{
                  borderTop: `2px solid ${s.accent}`,
                  outline: isSel ? `1px solid ${s.accent}` : "none",
                  cursor: findings ? "pointer" : "default",
                }}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold">{s.name}</h3>
                  {won && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: "rgb(15 138 77 / 0.12)", color: "var(--pos)" }}>
                      winner
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--muted)]">{s.positioningThesis}</p>
                {s.representativeImage.url || streamedImages.urls[s.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.representativeImage.url ?? streamedImages.urls[s.id]}
                    alt={`Key visual for ${s.name}`}
                    className="slide-in mt-3 aspect-[16/9] w-full rounded-lg border border-[var(--line)] object-cover"
                  />
                ) : (
                  <ImageSkeleton className="mt-3 aspect-[16/9] w-full rounded-lg" />
                )}
                <div className="panel-2 mt-3 p-3">
                  <p className="whitespace-pre-line text-[12.5px] leading-snug text-[var(--ink-2)]">
                    {s.sampleLaunchPost.body}
                  </p>
                </div>
                <p className="mt-2.5 text-[11.5px] text-[var(--faint)]">CTA: {s.callToAction}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Simulation */}
      <section className="mb-6">
        <h2 className="label mb-3">Simulation</h2>
        <SimulationView campaignId={params.id} onComplete={onSimComplete} />
      </section>

      {/* Findings */}
      {findings && (
        <section className="slide-in mb-6">
          <h2 className="label mb-3">What the simulation learned</h2>
          <div className="panel p-5">
            <p className="text-[15px] leading-relaxed">{findings.whyItWon}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {findings.findings.map((f) => {
                const tone =
                  f.kind === "worked"
                    ? { bg: "rgb(15 138 77 / 0.06)", bd: "rgb(15 138 77 / 0.28)", fg: "var(--pos)" }
                    : f.kind === "failed"
                      ? { bg: "rgb(208 52 44 / 0.06)", bd: "rgb(208 52 44 / 0.28)", fg: "var(--neg)" }
                      : f.kind === "risk"
                        ? { bg: "rgb(180 83 9 / 0.06)", bd: "rgb(180 83 9 / 0.28)", fg: "var(--warn)" }
                        : { bg: "rgb(91 91 214 / 0.06)", bd: "rgb(91 91 214 / 0.28)", fg: "var(--accent)" };
                return (
                  <div key={f.id} className="rounded-lg border p-3" style={{ background: tone.bg, borderColor: tone.bd }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.fg }}>
                        {f.kind}
                      </span>
                      <span className="mono text-[10px] text-[var(--faint)]">{f.axis}</span>
                    </div>
                    <h4 className="mt-1 text-[13.5px] font-semibold">{f.headline}</h4>
                    <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{f.detail}</p>
                    <p className="mt-2 border-l-2 pl-2 text-[12px] leading-snug" style={{ borderColor: tone.bd, color: tone.fg }}>
                      → {f.directive}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-4 border-t border-[var(--line)] pt-4">
              <button className="btn btn-primary" onClick={buildTimeline} disabled={building || !selected}>
                {building ? "Generating campaign…" : "Turn this strategy into a campaign"}
              </button>
              <span className="text-[12.5px] text-[var(--muted)]">
                Using <strong className="text-[var(--ink)]">{strategies.find((s) => s.id === selected)?.name}</strong>
                {" · "}
                {findings.findings.length} findings applied as constraints
              </span>
            </div>
            {err && <p className="mt-3 text-[12.5px] text-red-600">{err}</p>}
          </div>
        </section>
      )}
    </Shell>
  );
}
