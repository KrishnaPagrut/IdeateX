/**
 * Smoke test for the provider layer. Runs the full generation chain twice with
 * the same seed and asserts the output is schema-valid and byte-identical,
 * which is what guarantees the demo replays the same way on stage.
 */
import { ai, providerStatus } from "../src/lib/ai";
import { buildPopulation } from "../src/lib/audience";
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
  themes: ["memes", "founder_led", "direct_response"],
};

async function run(seed: number) {
  const research = await ai.structured(ResearchReportSchema, "researcher", "research this", {
    task: "research",
    seed,
    context: { brief },
  });
  const design = await ai.structured(
    AudienceDesignSchema, "audience", "build cohorts", {
    task: "audience",
    seed,
    context: { brief, research },
  });
  const audience = buildPopulation(design.cohorts, seed);
  const strategies = await ai.structured(
    z.array(CampaignStrategySchema).length(3),
    "strategist",
    "generate strategies",
    { task: "strategies", seed, context: { brief, audience } },
  );
  return { research, audience, strategies };
}

(async () => {
  console.log("provider:", providerStatus());

  const a = await run(42);
  const b = await run(42);

  const identical = JSON.stringify(a) === JSON.stringify(b);

  console.log("\n--- research ---");
  console.log("category:", a.research.category);
  console.log("findings:", a.research.findings.length, "| tensions:", a.research.observedTensions.length);

  console.log("\n--- audience ---");
  console.log("cohorts:", a.audience.cohorts.length, "| personas:", a.audience.personas.length, "| edges:", a.audience.edges.length);
  const shareSum = a.audience.cohorts.reduce((s, c) => s + c.populationShare, 0);
  console.log("population share sums to:", shareSum.toFixed(3));
  a.audience.cohorts.forEach((c) =>
    console.log(`  ${c.name.padEnd(22)} ${(c.populationShare * 100).toFixed(1).padStart(5)}%  skepticism ${c.baseline.skepticism}`),
  );
  const sample = a.audience.personas[0];
  console.log(`  sample persona: @${sample.handle} (${sample.displayName}) humor=${sample.humor} skep=${sample.skepticism} infl=${sample.influence}`);

  console.log("\n--- strategies ---");
  a.strategies.forEach((s) => {
    console.log(`  [${s.theme}] ${s.name}`);
    console.log(`     thesis: ${s.positioningThesis.slice(0, 88)}...`);
    console.log(`     post:   ${s.sampleLaunchPost.body.split("\n")[0].slice(0, 70)}`);
    console.log(`     cta:    ${s.callToAction}`);
  });

  const imgs = await ai.image("test key visual", { seed: 42, n: 2 });
  console.log("\nimages:", imgs.length, "provider:", imgs[0].provider, "bytes:", imgs[0].url.length);

  const differentSeed = await run(1337);
  const varies = JSON.stringify(differentSeed) !== JSON.stringify(a);

  console.log("\n=== determinism: same seed identical =", identical);
  console.log("=== variation:   diff seed differs   =", varies);

  if (!identical || !varies) process.exit(1);
  console.log("\nSMOKE PASS");
})().catch((e) => {
  console.error("SMOKE FAIL:", e);
  process.exit(1);
});
