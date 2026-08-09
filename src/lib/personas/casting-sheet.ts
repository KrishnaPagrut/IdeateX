// ---------------------------------------------------------------------------
// Casting sheets: per-batch randomized constraint sheets for persona
// generation. Every generation batch draws a fresh sheet — a gender quota,
// an age curve, an income spread, household + geography mixes, and a pair of
// wildcard "texture" constraints — so no two batches are cast from the same
// mold. Deterministic when given a seed (tests and `seed-personas --seed N`
// pin behavior); random seed by default.
//
// Consumed by src/lib/prompts/persona-gen.ts (rendered as hard batch
// requirements), scripts/seed-personas.ts, and /api/personas/generate.
// ---------------------------------------------------------------------------

export interface GenderQuota {
  /** Percentages; always sum to 100. */
  women: number;
  men: number;
  nonbinary: number;
}

export type AgeCurve = "skew-young" | "skew-old" | "bimodal" | "flat";

export type IncomeSpread = "low-heavy" | "middle-heavy" | "high-heavy" | "barbell" | "even";

export type GeographyMix =
  | "urban-heavy"
  | "suburban-heavy"
  | "small-town-heavy"
  | "rural-heavy"
  | "even-mix";

export type HouseholdStructure =
  | "single-person"
  | "couple-no-kids"
  | "kids-at-home"
  | "multigenerational"
  | "roommates";

export interface Wildcard {
  /** Short kebab-case key for log one-liners. */
  key: string;
  /** The constraint sentence rendered into the prompt. */
  text: string;
}

export interface CastingSheet {
  /** The seed that produced this sheet (recorded for reproducibility). */
  seed: number;
  genderQuota: GenderQuota;
  ageCurve: AgeCurve;
  incomeSpread: IncomeSpread;
  /** Two household structures that must each appear at least once. */
  householdEmphasis: [HouseholdStructure, HouseholdStructure];
  geographyMix: GeographyMix;
  /** The batch's "texture pair": two wildcard constraints, one persona each. */
  wildcards: [Wildcard, Wildcard];
}

// --- seeded PRNG -----------------------------------------------------------

/** mulberry32 — small, fast, deterministic PRNG over a 32-bit seed. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts — derive stable per-(pool, batch) seeds from one base seed. */
export function deriveSeed(baseSeed: number, ...parts: Array<string | number>): number {
  let h = 0x811c9dc5 ^ (baseSeed >>> 0);
  for (const part of parts) {
    for (const ch of String(part)) {
      h ^= ch.codePointAt(0)!;
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f; // separator so ("ab","c") ≠ ("a","bc")
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickTwoDistinct<T>(rng: () => number, items: readonly T[]): [T, T] {
  const first = Math.floor(rng() * items.length);
  let second = Math.floor(rng() * (items.length - 1));
  if (second >= first) second += 1;
  return [items[first], items[second]];
}

// --- draw banks ------------------------------------------------------------

const AGE_CURVES: readonly AgeCurve[] = ["skew-young", "skew-old", "bimodal", "flat"];

const AGE_CURVE_TEXT: Record<AgeCurve, string> = {
  "skew-young":
    "most of the batch under 35, with a thin tail of older people (bend within what is plausible for this pool)",
  "skew-old":
    "most of the batch over 50, with a thin tail of younger people (bend within what is plausible for this pool)",
  bimodal:
    "cluster at both ends — young adults AND 55+ — with few in the middle (within pool plausibility)",
  flat: "ages spread evenly across the pool's plausible range — no clustering around 30-45",
};

const INCOME_SPREADS: readonly IncomeSpread[] = [
  "low-heavy",
  "middle-heavy",
  "high-heavy",
  "barbell",
  "even",
];

const INCOME_SPREAD_TEXT: Record<IncomeSpread, string> = {
  "low-heavy": "majority in the low and lower_middle bands; at most one high earner",
  "middle-heavy": "cluster in middle and lower_middle; the extremes are the exception",
  "high-heavy": "majority upper_middle and high; at most one low-band person",
  barbell: "cluster at BOTH the low and high ends with a thin middle",
  even: "spread evenly across all five income bands",
};

const GEOGRAPHY_MIXES: readonly GeographyMix[] = [
  "urban-heavy",
  "suburban-heavy",
  "small-town-heavy",
  "rural-heavy",
  "even-mix",
];

const GEOGRAPHY_MIX_TEXT: Record<GeographyMix, string> = {
  "urban-heavy": "majority big-city dwellers; the rest suburban, small-town, or rural",
  "suburban-heavy": "majority suburban; the rest split across urban, small-town, and rural",
  "small-town-heavy": "majority small-town; the rest split across urban, suburban, and rural",
  "rural-heavy": "majority rural or small-town; city dwellers are the exception",
  "even-mix": "roughly even split across urban / suburban / small-town / rural",
};

const HOUSEHOLD_STRUCTURES: readonly HouseholdStructure[] = [
  "single-person",
  "couple-no-kids",
  "kids-at-home",
  "multigenerational",
  "roommates",
];

/**
 * The wildcard bank: life textures that stop batches from converging on the
 * same tidy defaults. Each entry claims exactly one persona in the batch.
 */
export const WILDCARD_BANK: readonly Wildcard[] = [
  { key: "mid-career-change", text: "one persona is mid-way through a career change into a different field" },
  { key: "recent-windfall", text: "one persona recently came into unexpected money (inheritance, settlement, sale) and is still deciding what it changes" },
  { key: "caretaking-parent", text: "one persona is actively caretaking an aging parent alongside everything else" },
  { key: "category-hater", text: "one persona actively dislikes and avoids the product category this pool most often gets asked about" },
  { key: "non-driver", text: "one persona does not drive — by choice, cost, or circumstance — and it shapes their daily logistics" },
  { key: "night-shift-worker", text: "one persona works overnight shifts and lives on an inverted schedule" },
  { key: "new-to-town", text: "one persona moved to their current town within the last year and is still rebuilding their routines" },
  { key: "recently-laid-off", text: "one persona was laid off in the past six months and is recalibrating spending" },
  { key: "side-hustler", text: "one persona runs a small side hustle on top of their main occupation" },
  { key: "chronic-illness", text: "one persona quietly manages a chronic illness that shapes their energy and budget" },
  { key: "recent-divorce", text: "one persona is freshly divorced and rebuilding a one-income household" },
  { key: "new-baby", text: "one persona has a baby under one year old and is sleep-deprived into new buying habits" },
  { key: "debt-payoff-mode", text: "one persona is aggressively paying down debt and vetoes almost all discretionary spending" },
  { key: "flip-phone-holdout", text: "one persona still uses a basic phone (or a smartphone in permanent do-not-disturb) and resists app-only anything" },
  { key: "first-gen-immigrant", text: "one persona is a first-generation immigrant navigating two consumer cultures at once" },
  { key: "long-distance-relationship", text: "one persona sustains a long-distance relationship and budgets around travel" },
  { key: "off-grid-curious", text: "one persona is seriously flirting with off-grid or radically simplified living" },
  { key: "union-member", text: "one persona is an active union member whose workplace identity colors their brand trust" },
  { key: "small-landlord", text: "one persona rents out a single property and thinks in maintenance costs" },
  { key: "sandwich-generation", text: "one persona supports both children and aging parents at the same time" },
  { key: "retired-early", text: "one persona retired unusually early and is adjusting to a fixed drawdown" },
  { key: "degree-free-success", text: "one persona built a solid career with no degree and bristles at credentialism" },
  { key: "serial-returner", text: "one persona returns a large share of what they buy and shops with the return policy open" },
  { key: "brand-boycotter", text: "one persona actively boycotts at least one major brand on principle" },
  { key: "sweepstakes-optimist", text: "one persona enters sweepstakes and lotteries habitually and budgets around 'maybe' money" },
  { key: "extreme-couponer", text: "one persona treats couponing and points optimization as a serious hobby" },
  { key: "weekend-volunteer", text: "one persona gives most weekends to volunteering and filters purchases through that community" },
  { key: "gig-app-juggler", text: "one persona juggles three or more gig apps and knows each platform's tricks" },
  { key: "hobby-monetizer", text: "one persona is trying to turn a hobby into income and is precious about tools" },
  { key: "recent-scam-victim", text: "one persona was recently burned by a scam and now distrusts unfamiliar checkout flows" },
  { key: "multilingual-household", text: "one persona runs a household where two or more languages are spoken daily" },
  { key: "seasonal-worker", text: "one persona earns most of their income in one season and stretches it across the year" },
  { key: "house-poor", text: "one persona is house-poor: proud of the address, thin everywhere else" },
  { key: "family-it-department", text: "one persona is the unofficial tech support for their entire extended family" },
  { key: "insomniac-scroller", text: "one persona does most of their browsing and buying between midnight and 4am" },
];

// --- sheet construction ----------------------------------------------------

/**
 * Draw a casting sheet. Deterministic for a given seed; a random seed is drawn
 * when none is provided. Gender quota: women 40-55%, men 40-55%,
 * nonbinary/other 3-8% — redrawn per batch, never one fixed split.
 */
export function buildCastingSheet(seed?: number): CastingSheet {
  const actualSeed = seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = createRng(actualSeed);

  // Draw women and nonbinary in-range, then balance men into 40-55 by
  // shifting the excess/deficit onto women (stays within her 40-55 range).
  let women = 40 + Math.floor(rng() * 16); // 40-55
  const nonbinary = 3 + Math.floor(rng() * 6); // 3-8
  let men = 100 - women - nonbinary;
  if (men > 55) {
    women += men - 55;
    men = 55;
  } else if (men < 40) {
    women -= 40 - men;
    men = 40;
  }

  return {
    seed: actualSeed,
    genderQuota: { women, men, nonbinary },
    ageCurve: pick(rng, AGE_CURVES),
    incomeSpread: pick(rng, INCOME_SPREADS),
    householdEmphasis: pickTwoDistinct(rng, HOUSEHOLD_STRUCTURES),
    geographyMix: pick(rng, GEOGRAPHY_MIXES),
    wildcards: pickTwoDistinct(rng, WILDCARD_BANK),
  };
}

/**
 * Render the sheet as the hard-requirements block of a generation prompt.
 * `count` is the batch size — quotas are phrased against it so small batches
 * round sensibly instead of failing impossible percentages.
 */
export function renderCastingSheet(sheet: CastingSheet, count: number): string {
  const g = sheet.genderQuota;
  const [h1, h2] = sheet.householdEmphasis;
  const [w1, w2] = sheet.wildcards;
  return [
    `# Batch casting sheet — HARD requirements (fit them as exactly as ${count} people allow)`,
    `- Gender split: ~${g.women}% women / ${g.men}% men / ${g.nonbinary}% nonbinary or other. Apply the closest whole-person split to ${count}; when ${count} is small, still vary gender rather than defaulting to one.`,
    `- Age curve: ${sheet.ageCurve} — ${AGE_CURVE_TEXT[sheet.ageCurve]}.`,
    `- Income spread: ${sheet.incomeSpread} — ${INCOME_SPREAD_TEXT[sheet.incomeSpread]}.`,
    `- Household structures: span single-person / couple-no-kids / kids-at-home / multigenerational / roommate households across the batch; at least one "${h1}" and one "${h2}" household.`,
    `- Geography: ${sheet.geographyMix} — ${GEOGRAPHY_MIX_TEXT[sheet.geographyMix]}.`,
    `- Wildcards (exactly one persona each; weave into their life naturally, never as a gimmick):`,
    `  - ${w1.key}: ${w1.text}.`,
    `  - ${w2.key}: ${w2.text}.`,
  ].join("\n");
}

/** One-liner for seeder logs: "skew-old · 52/43/5 · rural-heavy · barbell income · hh: multigenerational+roommates · wildcards: night-shift-worker, category-hater". */
export function sheetSummary(sheet: CastingSheet): string {
  const g = sheet.genderQuota;
  return [
    sheet.ageCurve,
    `${g.women}/${g.men}/${g.nonbinary}`,
    sheet.geographyMix,
    `${sheet.incomeSpread} income`,
    `hh: ${sheet.householdEmphasis.join("+")}`,
    `wildcards: ${sheet.wildcards.map((w) => w.key).join(", ")}`,
  ].join(" · ");
}
