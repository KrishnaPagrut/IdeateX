/**
 * Seeded deterministic RNG (mulberry32) plus small helpers.
 *
 * Every stochastic decision in the mock provider and the simulation engine
 * routes through here, so a given seed replays the exact same run. That makes
 * the demo reproducible on stage and makes simulation bugs debuggable.
 */
export type Rng = {
  next(): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  sample<T>(items: readonly T[], n: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  bool(probability: number): boolean;
  /** Normal-ish value in [0,1] centred on `mean`, clamped. */
  around(mean: number, spread?: number): number;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min));

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return {
    next,
    int,
    shuffle,
    pick: <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    sample: <T,>(items: readonly T[], n: number) => shuffle(items).slice(0, n),
    bool: (p: number) => next() < p,
    around: (mean: number, spread = 0.18) => {
      // Average of three draws approximates a normal distribution well enough.
      const jitter = ((next() + next() + next()) / 3 - 0.5) * 2 * spread;
      return Math.min(1, Math.max(0, mean + jitter));
    },
  };
}

/** Stable string → int hash, so names and ids seed reproducibly. */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
