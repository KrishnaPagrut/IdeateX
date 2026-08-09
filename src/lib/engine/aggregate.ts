import type { Verdict } from "@/lib/schemas/verdict";

// ---------------------------------------------------------------------------
// PURE aggregation over persona verdicts. No LLM, no DB — deterministic maths
// only, so it is unit-testable and cheap to recompute. The result is stored
// verbatim in runs.aggregates and consumed by critics, synthesis, and the UI.
// ---------------------------------------------------------------------------

export interface VerdictRecord {
  personaId: string;
  personaName: string;
  segment: string;
  archetype: string;
  incomeBand: string;
  verdict: Verdict;
}

export interface GroupStats {
  count: number;
  mean: number;
  median: number;
}

export interface ObjectionRow {
  /** Representative (first-seen) surface form of the normalized objection. */
  label: string;
  count: number;
  /** Fraction of the sample that raised this objection (0..1). */
  share: number;
}

export interface WtpCadenceStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  currency: string;
}

export interface Aggregates {
  sampleSize: number;
  adoption: {
    /** 10 buckets: [0,10), [10,20), … [90,100]. */
    histogram: number[];
    mean: number;
    median: number;
    bySegment: Record<string, GroupStats>;
    byArchetype: Record<string, GroupStats>;
    byIncomeBand: Record<string, GroupStats>;
  };
  emotionalReactions: Record<string, number>;
  /** Normalized objection frequency table, top 10 by count. */
  objections: ObjectionRow[];
  wtp: {
    applicable: number;
    notApplicable: number;
    byCadence: Record<string, WtpCadenceStats>;
  };
  /** Fraction of the sample that would recommend (0..1). */
  recommendRate: number;
  meanConfidence: number;
}

const HISTOGRAM_BUCKETS = 10;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function histogramBucket(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  return Math.min(HISTOGRAM_BUCKETS - 1, Math.floor(clamped / 10));
}

/** Lowercase, strip punctuation, collapse whitespace — the dedupe key for objections. */
export function normalizeObjection(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function groupStats(groups: Map<string, number[]>): Record<string, GroupStats> {
  const out: Record<string, GroupStats> = {};
  for (const [key, values] of groups) {
    out[key] = { count: values.length, mean: round2(mean(values)), median: round2(median(values)) };
  }
  return out;
}

export function computeAggregates(records: VerdictRecord[]): Aggregates {
  const sampleSize = records.length;
  const scores = records.map((r) => r.verdict.adoptionLikelihood);

  const histogram = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  for (const score of scores) histogram[histogramBucket(score)] += 1;

  const bySegment = new Map<string, number[]>();
  const byArchetype = new Map<string, number[]>();
  const byIncomeBand = new Map<string, number[]>();
  const emotionalReactions: Record<string, number> = {};
  const objectionCounts = new Map<string, { label: string; count: number }>();
  const wtpByCadence = new Map<string, { amounts: number[]; currency: string }>();
  let wtpApplicable = 0;
  let recommendCount = 0;

  for (const record of records) {
    const { verdict } = record;
    const push = (map: Map<string, number[]>, key: string) => {
      const arr = map.get(key) ?? [];
      arr.push(verdict.adoptionLikelihood);
      map.set(key, arr);
    };
    push(bySegment, record.segment);
    push(byArchetype, record.archetype);
    push(byIncomeBand, record.incomeBand);

    emotionalReactions[verdict.emotionalReaction] =
      (emotionalReactions[verdict.emotionalReaction] ?? 0) + 1;

    for (const objection of verdict.topObjections) {
      const key = normalizeObjection(objection);
      if (!key) continue;
      const entry = objectionCounts.get(key);
      if (entry) entry.count += 1;
      else objectionCounts.set(key, { label: objection.trim(), count: 1 });
    }

    if (verdict.willingnessToPay) {
      wtpApplicable += 1;
      const { cadence, amount, currency } = verdict.willingnessToPay;
      const bucket = wtpByCadence.get(cadence) ?? { amounts: [], currency };
      bucket.amounts.push(amount);
      wtpByCadence.set(cadence, bucket);
    }

    if (verdict.wouldRecommend) recommendCount += 1;
  }

  const objections: ObjectionRow[] = [...objectionCounts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 10)
    .map((o) => ({
      label: o.label,
      count: o.count,
      share: sampleSize === 0 ? 0 : round2(o.count / sampleSize),
    }));

  const byCadence: Record<string, WtpCadenceStats> = {};
  for (const [cadence, { amounts, currency }] of wtpByCadence) {
    byCadence[cadence] = {
      count: amounts.length,
      mean: round2(mean(amounts)),
      median: round2(median(amounts)),
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      currency,
    };
  }

  return {
    sampleSize,
    adoption: {
      histogram,
      mean: round2(mean(scores)),
      median: round2(median(scores)),
      bySegment: groupStats(bySegment),
      byArchetype: groupStats(byArchetype),
      byIncomeBand: groupStats(byIncomeBand),
    },
    emotionalReactions,
    objections,
    wtp: {
      applicable: wtpApplicable,
      notApplicable: sampleSize - wtpApplicable,
      byCadence,
    },
    recommendRate: sampleSize === 0 ? 0 : round2(recommendCount / sampleSize),
    meanConfidence: round2(mean(records.map((r) => r.verdict.confidence))),
  };
}
