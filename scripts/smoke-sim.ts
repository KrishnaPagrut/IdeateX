/**
 * Runs all three strategies against the same audience and prints the
 * comparison. This is the demo's core moment, so it needs to hold up: the
 * strategies must actually diverge, and the divergence must be explicable.
 */
import { ai } from "../src/lib/ai";
import { buildPopulation } from "../src/lib/audience";
import { Simulation, seedFor } from "../src/lib/sim/engine";
import {
  CampaignStrategySchema,
  ResearchReportSchema,
  AudienceDesignSchema,
  type CampaignBrief,
} from "../src/lib/schemas";
import { z } from "zod";

const brief: CampaignBrief = {
  productName: "Cadence",
  productUrl: "",
  productDescription: "a scheduling tool that removes standup meetings for async teams",
  objective: "drive 500 signups in launch week",
  launchDate: "2026-09-01",
  targetMarket: "remote-first engineering teams of 10-50",
  platforms: ["x", "instagram", "linkedin"],
  brandVoice: "irreverent",
  themes: ["memes", "founder_led", "educational"],
};

(async () => {
  const seed = 7;
  const research = await ai.structured(ResearchReportSchema, "r", "r", { task: "research", seed, context: { brief } });
  const design = await ai.structured(
    AudienceDesignSchema, "a", "a", {
    task: "audience",
    seed,
    context: { brief, research },
  });
  const audience = buildPopulation(design.cohorts, seed);
  const strategies = await ai.structured(z.array(CampaignStrategySchema).length(3), "s", "s", {
    task: "strategies",
    seed,
    context: { brief, audience },
  });

  console.log(`audience: ${audience.personas.length} personas across ${audience.cohorts.length} cohorts\n`);

  const results = [];
  for (const strategy of strategies) {
    const sim = new Simulation(audience, strategy, {
      seed: seedFor("demo", strategy.id),
      ticks: 24,
      llmBudget: 0, // deterministic path only for this smoke test
    });

    let last;
    let ticks = 0;
    for await (const snap of sim.run()) {
      last = snap;
      ticks++;
    }
    if (!last) throw new Error("no snapshots produced");

    results.push({ strategy, snap: last, events: sim.finalEvents().length });
    console.log(`── ${strategy.name} [${strategy.theme}] ─────────────────`);
    console.log(`   ticks ${ticks} · events ${sim.finalEvents().length} · posts ${last.posts.length}`);
    const s = last.scores;
    console.log(
      `   reach ${String(s.reach).padStart(3)} | trust ${String(s.trust).padStart(3)} | compr ${String(s.messageComprehension).padStart(3)} | intent ${String(s.purchaseIntent).padStart(3)}`,
    );
    console.log(
      `   share ${String(s.sharePropensity).padStart(3)} | contro ${String(s.controversy).padStart(3)} | fit ${String(s.audienceFit).padStart(3)} | risk ${String(s.brandSafetyRisk).padStart(3)}`,
    );
    console.log(`   narratives: ${last.narratives.map((n) => `${n.label} (${n.momentum.toFixed(1)})`).join(", ") || "none"}`);
    last.cohortState.forEach((c) => {
      const name = audience.cohorts.find((x) => x.id === c.cohortId)?.name ?? c.cohortId;
      console.log(
        `     ${name.padEnd(22)} reach ${c.reached}/${c.population}  sentiment ${c.sentiment >= 0 ? "+" : ""}${c.sentiment.toFixed(2)}  intent ${c.purchaseIntent}`,
      );
    });
    console.log();
  }

  // Determinism check: same seed must replay identically.
  const rerun = new Simulation(audience, strategies[0], {
    seed: seedFor("demo", strategies[0].id),
    ticks: 24,
    llmBudget: 0,
  });
  let rerunLast;
  for await (const s of rerun.run()) rerunLast = s;
  const deterministic =
    JSON.stringify(rerunLast?.scores) === JSON.stringify(results[0].snap.scores);

  // Divergence check: the three strategies must not land on the same numbers.
  const distinct = new Set(results.map((r) => JSON.stringify(r.snap.scores))).size === 3;

  console.log("=== deterministic replay:", deterministic);
  console.log("=== strategies diverge:  ", distinct);

  const ranked = [...results].sort((a, b) => b.snap.scores.purchaseIntent - a.snap.scores.purchaseIntent);
  console.log(`=== winner by purchase intent: ${ranked[0].strategy.name} (${ranked[0].snap.scores.purchaseIntent})`);

  if (!deterministic || !distinct) process.exit(1);
  console.log("\nSIM SMOKE PASS");
})().catch((e) => {
  console.error("SIM SMOKE FAIL:", e);
  process.exit(1);
});
