import { describe, expect, test } from "vitest";

import type { AudienceCohortDef } from "@/lib/schemas/brief";
import type {
  CampaignStrategy,
  CreativeTheme,
  SyntheticAudience,
} from "@/lib/schemas/marketing";
import { buildFollowGraph } from "./graph";
import { Simulation, seedFor, type SimSnapshot } from "./sim";

const cohorts: AudienceCohortDef[] = [
  {
    name: "indie-devs",
    description: "Solo builders shipping side projects",
    whyRelevant: "They buy tools impulsively",
    populationShare: 0.5,
    coreInterests: ["typescript", "shipping fast"],
    coreValues: ["craft"],
    commonObjections: ["another subscription"],
    purchasingTriggers: ["saves an evening", "free tier"],
    mediaDiet: ["x", "reddit"],
    baseline: { humor: 0.7, skepticism: 0.5, influence: 0.4, persuadability: 0.5 },
  },
  {
    name: "eng-managers",
    description: "Managers who buy for teams",
    whyRelevant: "Budget holders",
    populationShare: 0.5,
    coreInterests: ["velocity", "hiring"],
    coreValues: ["predictability"],
    commonObjections: ["procurement pain"],
    purchasingTriggers: ["team-wide metrics"],
    mediaDiet: ["linkedin", "email"],
    baseline: { humor: 0.3, skepticism: 0.7, influence: 0.6, persuadability: 0.3 },
  },
];

function makeAudience(n = 16): SyntheticAudience {
  const members = Array.from({ length: n }, (_, i) => ({
    personaId: `p${i}`,
    cohort: cohorts[i % 2].name,
    traits: {
      humor: (i % 5) / 5,
      skepticism: (i % 4) / 4,
      influence: (i % 10) / 10,
      persuadability: 0.5,
    },
    engagement: { postRate: 0.6, replyRate: 0.5, repostRate: 0.3, lurkRate: 0.3 },
  }));
  return {
    members,
    edges: buildFollowGraph(
      members.map((m) => ({ personaId: m.personaId, cohort: m.cohort, influence: m.traits.influence })),
      99,
    ),
    seed: 99,
  };
}

function makeStrategy(theme: CreativeTheme): CampaignStrategy {
  return {
    id: `strategy_${theme}`,
    name: `The ${theme} play`,
    theme,
    positioningThesis: "Ship faster with fewer tabs open. Everything in one place.",
    targetCohortIds: ["indie-devs"],
    centralMessage: "Stop paying for five tools that do half the job each.",
    creativeDirection: "Plain screenshots, real numbers. No stock photos.",
    sampleLaunchPost: {
      platform: "x",
      body: "we built the tool we kept wishing existed. setup in 2 minutes, priced like a sandwich.",
      hashtags: ["#buildinpublic"],
    },
    callToAction: "Try it free",
    contentMix: [
      { format: "short_text", platform: "x", weight: 0.6 },
      { format: "article", platform: "reddit", weight: 0.4 },
    ],
  };
}

async function runAll(sim: Simulation): Promise<SimSnapshot[]> {
  const out: SimSnapshot[] = [];
  for await (const snap of sim.run()) out.push(snap);
  return out;
}

const makeSim = (seed: number, theme: CreativeTheme = "memes") =>
  new Simulation(makeAudience(), cohorts, makeStrategy(theme), { seed, ticks: 16 });

describe("Simulation", () => {
  test("same seed replays identically", async () => {
    const a = await runAll(makeSim(42));
    const b = await runAll(makeSim(42));
    expect(a.map((s) => s.scores)).toEqual(b.map((s) => s.scores));
    expect(a[a.length - 1].events.length).toEqual(b[b.length - 1].events.length);
  });

  test("different themes diverge", async () => {
    const memes = await runAll(makeSim(42, "memes"));
    const edu = await runAll(makeSim(42, "educational"));
    expect(memes[memes.length - 1].scores).not.toEqual(edu[edu.length - 1].scores);
  });

  test("reach is monotonic and bounded by population", async () => {
    const snaps = await runAll(makeSim(7));
    let prev = 0;
    for (const s of snaps) {
      const reached = s.activatedPersonaIds.length;
      expect(reached).toBeGreaterThanOrEqual(prev);
      expect(reached).toBeLessThanOrEqual(16);
      prev = reached;
    }
    expect(prev).toBeGreaterThan(0);
  });

  test("scores stay in 0-100", async () => {
    const snaps = await runAll(makeSim(3));
    for (const v of Object.values(snaps[snaps.length - 1].scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test("llm reactions are used and capped by budget", async () => {
    let calls = 0;
    const sim = new Simulation(makeAudience(), cohorts, makeStrategy("memes"), {
      seed: 42,
      ticks: 16,
      llmBudget: 2,
      reaction: async () => {
        calls += 1;
        return "the pricing page actually answered my question, rare";
      },
    });
    const snaps = await runAll(sim);
    expect(calls).toBeLessThanOrEqual(2);
    // run() yields delta events per tick, so the union is the full log.
    const llmBacked = snaps.flatMap((s) => s.events).filter((e) => e.llmBacked);
    expect(llmBacked.length).toBe(calls);
  });

  test("seedFor is stable", () => {
    expect(seedFor("run1", "strategy_0")).toBe(seedFor("run1", "strategy_0"));
    expect(seedFor("run1", "strategy_0")).not.toBe(seedFor("run1", "strategy_1"));
  });
});
