"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { GradientText, HeroGraphic, Reveal, SectionLabel } from "@/components/ui";
import type { CampaignBrief } from "@/lib/schemas";

const PLATFORMS = ["x", "instagram", "linkedin", "tiktok", "youtube", "reddit"] as const;
const THEMES = [
  { id: "memes", label: "Memes" },
  { id: "founder_led", label: "Founder-led" },
  { id: "direct_response", label: "Direct response" },
  { id: "educational", label: "Educational" },
  { id: "aspirational", label: "Aspirational" },
  { id: "serious", label: "Serious" },
] as const;
const VOICES = ["playful", "authoritative", "warm", "irreverent", "technical", "minimal"] as const;

const PRESET = {
  productName: "Cadence",
  productDescription: "a scheduling tool that removes standup meetings for async engineering teams",
  objective: "drive 500 signups in launch week",
  targetMarket: "remote-first engineering teams of 10-50",
};

export default function IntakePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    productName: "",
    productUrl: "",
    productDescription: "",
    objective: "",
    launchDate: new Date(Date.now() + 12096e5).toISOString().slice(0, 10),
    targetMarket: "",
    brandVoice: "irreverent" as (typeof VOICES)[number],
  });
  const [platforms, setPlatforms] = useState<string[]>(["x", "instagram"]);
  const [themes, setThemes] = useState<string[]>(["memes", "founder_led", "educational"]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const valid =
    form.productName.trim() &&
    form.productDescription.trim() &&
    form.objective.trim() &&
    form.targetMarket.trim() &&
    platforms.length > 0 &&
    themes.length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);

    // These stage labels are cosmetic pacing for the generation wait — the
    // server runs research → audience → strategies as one sequential call.
    const stages = [
      "Researching the category…",
      "Reading public conversation…",
      "Clustering behavioural patterns…",
      "Synthesising audience cohorts…",
      "Generating campaign strategies…",
    ];
    let i = 0;
    setStage(stages[0]);
    const ticker = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setStage(stages[i]);
    }, 1400);

    const brief: CampaignBrief = {
      ...form,
      platforms: platforms as CampaignBrief["platforms"],
      themes: themes as CampaignBrief["themes"],
    };

    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      router.push(`/campaign/${data.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    } finally {
      clearInterval(ticker);
    }
  }

  return (
    <Shell>
      {/*
        Asymmetric hero: 1.1fr/0.9fr gives the text column subtle dominance,
        per the design system's tension principle. The graphic drops on small
        screens rather than shrinking into illegibility.
      */}
      <section className="relative mb-16 grid items-center gap-10 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
        <div className="reveal is-visible">
          <SectionLabel live>Simulation-first</SectionLabel>
          <h1 className="display mt-6 text-[2.75rem] sm:text-[4rem] lg:text-[4.75rem]">
            Run the decision
            <br />
            <GradientText underline>before you make it</GradientText>.
          </h1>
          <p className="mt-6 max-w-[560px] text-[16.5px] leading-[1.7] text-[var(--muted)]">
            Your CTO simulates the build schedule thousands of times to find the date you can
            actually commit to. Your CMO tests three campaigns against a synthetic audience before
            you spend. Both report findings you can act on.
          </p>
          <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-2">
            {[
              ["4,000", "schedule runs"],
              ["48", "synthetic personas"],
              ["8", "comparative axes"],
            ].map(([n, l]) => (
              <li key={l} className="flex items-baseline gap-2">
                <span className="mono text-[18px] font-medium">{n}</span>
                <span className="text-[12.5px] text-[var(--muted)]">{l}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <a href="#brief" className="btn btn-primary">
              Start with your idea <span className="arrow">→</span>
            </a>
            <span className="text-[13px] text-[var(--faint)]">
              No account. Nothing is published.
            </span>
          </div>
        </div>

        <HeroGraphic />
      </section>

      <div id="brief" className="mx-auto max-w-[880px] scroll-mt-20">
        <Reveal className="mb-6">
          <SectionLabel>Step 01 — Company</SectionLabel>
          <h2 className="display mt-4 text-[2rem] sm:text-[2.5rem]">
            Tell us what you&apos;re <GradientText>building</GradientText>.
          </h2>
        </Reveal>

        <div className="panel panel-hover p-7">
          <div className="mb-5 flex items-center justify-between">
            <span className="label !mb-0">Company</span>
            <button
              className="chip"
              onClick={() => setForm((f) => ({ ...f, ...PRESET }))}
              type="button"
            >
              Use example
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Product name</label>
              <input className="field" value={form.productName} onChange={set("productName")} placeholder="Cadence" />
            </div>
            <div>
              <label className="label">Product URL (optional)</label>
              <input className="field" value={form.productUrl} onChange={set("productUrl")} placeholder="https://…" />
            </div>
          </div>

          <div className="mt-4">
            <label className="label">What it does</label>
            <textarea
              className="field resize-none"
              rows={2}
              value={form.productDescription}
              onChange={set("productDescription")}
              placeholder="a scheduling tool that removes standup meetings for async teams"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Objective</label>
              <input className="field" value={form.objective} onChange={set("objective")} placeholder="500 signups in launch week" />
            </div>
            <div>
              <label className="label">Launch date</label>
              <input className="field" type="date" value={form.launchDate} onChange={set("launchDate")} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Target market</label>
              <input className="field" value={form.targetMarket} onChange={set("targetMarket")} placeholder="remote-first eng teams of 10-50" />
            </div>
            <div>
              <label className="label">Brand voice</label>
              <select className="field" value={form.brandVoice} onChange={set("brandVoice")}>
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <label className="label">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="chip"
                  data-on={platforms.includes(p)}
                  onClick={() => toggle(platforms, setPlatforms, p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <label className="label">Creative themes — one strategy per theme, pick three</label>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  data-on={themes.includes(t.id)}
                  onClick={() => toggle(themes, setThemes, t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {themes.length !== 3 && (
              <p className="mt-2 text-[12px] text-[var(--warn)]">
                {themes.length < 3
                  ? `Pick ${3 - themes.length} more — the first three are used.`
                  : "Only the first three themes will be used."}
              </p>
            )}
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-4 border-t border-[var(--line)] pt-5">
            <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
              {busy ? "Building…" : <>Create company <span className="arrow">→</span></>}
            </button>
            {busy && (
              <span className="slide-in flex items-center gap-2 text-[13px] text-[var(--muted)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                {stage}
              </span>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
