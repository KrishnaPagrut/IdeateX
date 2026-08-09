import { describe, expect, it } from "vitest";

import type { Verdict } from "@/lib/schemas/verdict";
import {
  computeAggregates,
  histogramBucket,
  normalizeObjection,
  type VerdictRecord,
} from "./aggregate";

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    adoptionLikelihood: 50,
    willingnessToPay: null,
    emotionalReaction: "neutral",
    topObjections: [],
    dealBreakers: [],
    delighters: [],
    verbatimQuote: "Hm, maybe.",
    wouldRecommend: false,
    confidence: 70,
    ...overrides,
  };
}

let n = 0;
function makeRecord(
  verdict: Partial<Verdict> = {},
  meta: Partial<Omit<VerdictRecord, "verdict">> = {},
): VerdictRecord {
  n += 1;
  return {
    personaId: `persona-${n}`,
    personaName: `Persona ${n}`,
    segment: "General",
    archetype: "Everyperson",
    incomeBand: "middle",
    verdict: makeVerdict(verdict),
    ...meta,
  };
}

describe("histogramBucket", () => {
  it("buckets scores into 10 ranges with 100 in the last bucket", () => {
    expect(histogramBucket(0)).toBe(0);
    expect(histogramBucket(9.99)).toBe(0);
    expect(histogramBucket(10)).toBe(1);
    expect(histogramBucket(55)).toBe(5);
    expect(histogramBucket(99)).toBe(9);
    expect(histogramBucket(100)).toBe(9);
  });

  it("clamps out-of-range scores", () => {
    expect(histogramBucket(-5)).toBe(0);
    expect(histogramBucket(140)).toBe(9);
  });
});

describe("computeAggregates — adoption", () => {
  it("builds the histogram and overall mean/median", () => {
    const records = [5, 15, 15, 50, 95, 100].map((score) =>
      makeRecord({ adoptionLikelihood: score }),
    );
    const agg = computeAggregates(records);

    expect(agg.sampleSize).toBe(6);
    expect(agg.adoption.histogram).toEqual([1, 2, 0, 0, 0, 1, 0, 0, 0, 2]);
    expect(agg.adoption.histogram.reduce((a, b) => a + b, 0)).toBe(6);
    expect(agg.adoption.mean).toBe(46.67);
    expect(agg.adoption.median).toBe(32.5); // even count → midpoint average
  });

  it("computes per-segment, per-archetype, and per-income-band stats", () => {
    const records = [
      makeRecord({ adoptionLikelihood: 20 }, { segment: "A", archetype: "X", incomeBand: "low" }),
      makeRecord({ adoptionLikelihood: 40 }, { segment: "A", archetype: "X", incomeBand: "high" }),
      makeRecord({ adoptionLikelihood: 90 }, { segment: "B", archetype: "Y", incomeBand: "high" }),
    ];
    const agg = computeAggregates(records);

    expect(agg.adoption.bySegment.A).toEqual({ count: 2, mean: 30, median: 30 });
    expect(agg.adoption.bySegment.B).toEqual({ count: 1, mean: 90, median: 90 });
    expect(agg.adoption.byArchetype.X.mean).toBe(30);
    expect(agg.adoption.byIncomeBand.high).toEqual({ count: 2, mean: 65, median: 65 });
    expect(agg.adoption.byIncomeBand.low.count).toBe(1);
  });
});

describe("computeAggregates — objections", () => {
  it("normalizes surface variants into one row and keeps the first-seen label", () => {
    expect(normalizeObjection("  Too EXPENSIVE!! ")).toBe("too expensive");

    const records = [
      makeRecord({ topObjections: ["Too expensive!"] }),
      makeRecord({ topObjections: ["too   expensive", "No time"] }),
      makeRecord({ topObjections: ["TOO EXPENSIVE."] }),
    ];
    const agg = computeAggregates(records);

    expect(agg.objections[0]).toEqual({
      label: "Too expensive!",
      count: 3,
      share: 1,
    });
    expect(agg.objections[1]).toEqual({ label: "No time", count: 1, share: 0.33 });
    expect(agg.objections).toHaveLength(2);
  });

  it("caps the table at the top 10 by count", () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      makeRecord({ topObjections: [`objection number ${i}`] }),
    );
    // Make one objection dominate.
    records.push(makeRecord({ topObjections: ["objection number 3"] }));
    const agg = computeAggregates(records);

    expect(agg.objections).toHaveLength(10);
    expect(agg.objections[0].label).toBe("objection number 3");
    expect(agg.objections[0].count).toBe(2);
  });
});

describe("computeAggregates — reactions, WTP, recommend rate", () => {
  it("counts emotional reactions and recommend rate", () => {
    const records = [
      makeRecord({ emotionalReaction: "excited", wouldRecommend: true }),
      makeRecord({ emotionalReaction: "excited", wouldRecommend: true }),
      makeRecord({ emotionalReaction: "skeptical", wouldRecommend: false }),
      makeRecord({ emotionalReaction: "angry", wouldRecommend: false }),
    ];
    const agg = computeAggregates(records);

    expect(agg.emotionalReactions).toEqual({ excited: 2, skeptical: 1, angry: 1 });
    expect(agg.recommendRate).toBe(0.5);
  });

  it("splits WTP by cadence and tracks non-applicable verdicts", () => {
    const wtp = (amount: number, cadence: "monthly" | "one_time") => ({
      amount,
      currency: "USD",
      cadence,
    });
    const records = [
      makeRecord({ willingnessToPay: wtp(10, "monthly") }),
      makeRecord({ willingnessToPay: wtp(20, "monthly") }),
      makeRecord({ willingnessToPay: wtp(100, "one_time") }),
      makeRecord({ willingnessToPay: null }),
    ];
    const agg = computeAggregates(records);

    expect(agg.wtp.applicable).toBe(3);
    expect(agg.wtp.notApplicable).toBe(1);
    expect(agg.wtp.byCadence.monthly).toEqual({
      count: 2,
      mean: 15,
      median: 15,
      min: 10,
      max: 20,
      currency: "USD",
    });
    expect(agg.wtp.byCadence.one_time.count).toBe(1);
  });
});

describe("computeAggregates — empty input", () => {
  it("returns zeroed aggregates with no NaN", () => {
    const agg = computeAggregates([]);

    expect(agg.sampleSize).toBe(0);
    expect(agg.adoption.histogram).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(agg.adoption.mean).toBe(0);
    expect(agg.adoption.median).toBe(0);
    expect(agg.adoption.bySegment).toEqual({});
    expect(agg.emotionalReactions).toEqual({});
    expect(agg.objections).toEqual([]);
    expect(agg.wtp).toEqual({ applicable: 0, notApplicable: 0, byCadence: {} });
    expect(agg.recommendRate).toBe(0);
    expect(agg.meanConfidence).toBe(0);
    expect(JSON.stringify(agg)).not.toContain("NaN");
  });
});
