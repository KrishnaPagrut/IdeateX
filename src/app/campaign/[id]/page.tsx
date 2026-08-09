"use client";

/**
 * Company HQ — the delegation surface.
 *
 * You state an objective and hand it to an executive. Each role card shows
 * what that role gathers, what it analyses, and what it produces, plus its
 * current state so you can see at a glance what work exists.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, ProviderBadge } from "@/components/Shell";
import { FindingCard } from "@/components/Findings";
import { GradientText, Reveal, SectionLabel } from "@/components/ui";
import type { Finding } from "@/lib/schemas";

const ROLES = [
  {
    key: "cto" as const,
    title: "CTO",
    tagline: "Simulates the build schedule 4,000 times to find the date you can actually commit to.",
    gathers: "Decomposes the idea into engineering tasks with estimates and dependencies",
    simulates: "Monte Carlo over the dependency graph — P50/P80/P95 finish dates",
    produces: "Engineering tasks, spikes, and PR drafts",
    accent: "#0052ff",
    accent2: "#4d7cff",
  },
  {
    key: "cmo" as const,
    title: "CMO",
    tagline: "Simulates three campaigns against the same synthetic audience before you spend.",
    gathers: "Category research and a synthetic audience of fictional archetypes",
    simulates: "48 personas over 24 ticks — reach, trust, intent across eight axes",
    produces: "A dated campaign timeline with copy and generated visuals",
    accent: "#ec4899",
    accent2: "#f472b6",
  },
];

export default function CompanyPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [buildPlan, setBuildPlan] = useState<any>(null);
  const [objective, setObjective] = useState("");
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/campaign/${params.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/cto?companyId=${params.id}`, { cache: "no-store" }).then((r) => r.json()),
    ]).then(([c, p]) => {
      setData(c);
      setBuildPlan(p.buildPlan ?? null);
      if (c.campaign?.brief?.objective) setObjective(c.campaign.brief.objective);
    });
  }, [params.id]);

  if (!data?.campaign) {
    return (
      <Shell companyId={params.id}>
        <p className="text-[var(--muted)]">Loading…</p>
      </Shell>
    );
  }

  const { campaign, provider, items } = data;
  const ctoItems = (items ?? []).filter((i: any) => i.role === "cto").length;
  const cmoItems = (items ?? []).filter((i: any) => i.role !== "cto").length;
  const hasStrategies = Boolean(campaign.strategies?.length);

  const state = {
    cto: buildPlan
      ? `${buildPlan.plan.tasks.length} tasks · ${buildPlan.analysis.criticalPathDays}d critical path · ${ctoItems} drafts`
      : "No plan yet",
    cmo: hasStrategies
      ? `${campaign.audience?.cohorts.length ?? 0} cohorts · 3 strategies${cmoItems ? ` · ${cmoItems} assets` : ""}`
      : "No strategies yet",
  };

  // Surface the highest-weight findings from whichever roles have run.
  const topFindings: Finding[] = (buildPlan?.findings?.findings ?? [])
    .slice()
    .sort((a: Finding, b: Finding) => b.weight - a.weight)
    .slice(0, 4);

  return (
    <Shell companyId={params.id} company={campaign.brief.productName}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="reveal is-visible">
          <SectionLabel>Company</SectionLabel>
          <h1 className="display mt-4 text-[2.5rem] sm:text-[3.25rem]">
            {campaign.brief.productName}
          </h1>
          <p className="mt-3 max-w-[680px] text-[15.5px] leading-[1.7] text-[var(--muted)]">
            {campaign.brief.productDescription}
          </p>
          <p className="mono mt-3 text-[11.5px] uppercase tracking-[0.12em] text-[var(--faint)]">
            {campaign.brief.targetMarket}
          </p>
        </div>
        <ProviderBadge live={provider?.live ?? false} name={provider?.name ?? "mock"} />
      </div>

      {/* Delegation */}
      <Reveal className="mb-8">
        <div className="panel p-7">
          <SectionLabel live>Delegate</SectionLabel>
          <h2 className="display mt-4 mb-6 text-[1.85rem]">
            What should the team <GradientText>work on</GradientText>?
          </h2>

          <label className="label" htmlFor="objective">
            Objective
          </label>
          <input
            id="objective"
            className="field input-w mb-6"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Ship an MVP in 8 weeks and get 500 signups in launch week"
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                disabled={routing}
                onClick={() => {
                  setRouting(true);
                  router.push(`/campaign/${params.id}/${r.key}`);
                }}
                className="panel panel-hover group p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="icon-tile text-[15px] font-semibold"
                    style={{
                      background: `linear-gradient(135deg, ${r.accent}, ${r.accent2})`,
                      boxShadow: `0 4px 14px ${r.accent}40`,
                    }}
                  >
                    {r.title[0]}
                  </span>
                  <div>
                    <h3 className="text-[17px] font-semibold tracking-tight">{r.title}</h3>
                    <span className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">
                      {state[r.key]}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--muted)]">{r.tagline}</p>

                <dl className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                  {[
                    ["Gathers", r.gathers],
                    ["Simulates", r.simulates],
                    ["Produces", r.produces],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 text-[11.5px]">
                      <dt className="mono w-[62px] shrink-0 uppercase tracking-[0.1em] text-[var(--faint)]">
                        {k}
                      </dt>
                      <dd className="flex-1 leading-snug text-[var(--muted)]">{v}</dd>
                    </div>
                  ))}
                </dl>

                <span
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium"
                  style={{ color: r.accent }}
                >
                  Delegate to {r.title}
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Cross-role findings */}
      {topFindings.length > 0 && (
        <section>
          <div className="mb-4"><SectionLabel>Findings</SectionLabel><h2 className="display mt-4 text-[1.85rem]">What the team has <GradientText>learned</GradientText>.</h2></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {topFindings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </section>
      )}

      {!topFindings.length && (
        <div className="panel py-12 text-center">
          <p className="text-[15px] font-medium">No findings yet</p>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            Delegate the objective to a role. Each one gathers its own evidence and reports back
            findings with concrete directives.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href={`/campaign/${params.id}/cto`} className="btn">
              Start with the CTO
            </Link>
            <Link href={`/campaign/${params.id}/cmo`} className="btn">
              Start with the CMO
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}
