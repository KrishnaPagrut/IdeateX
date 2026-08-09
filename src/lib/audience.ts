/**
 * Derives a synthetic population from cohort designs.
 *
 * The model designs cohorts; this samples personas around their baselines and
 * wires the follow graph. Keeping it in code makes the population fast to
 * build, deterministic for a given seed, and statistically better distributed
 * than anything a model emits when asked for fifty objects at once.
 */
import { makeRng } from "./ai/rng";
import type { AudienceCohort, SyntheticAudience, SyntheticPersona } from "./schemas";

const FIRST_NAMES = [
  "Ada", "Nico", "Priya", "Rowan", "Sasha", "Theo", "Imani", "Diego", "Lena",
  "Kai", "Mira", "Otis", "Yuki", "Farid", "Noor", "Ines", "Jonas", "Talia",
  "Esme", "Bo", "Ravi", "Signe", "Amara", "Luca",
];
const LAST_NAMES = [
  "Okafor", "Lindqvist", "Marsh", "Baptiste", "Duarte", "Kowalski", "Reyes",
  "Ashworth", "Vance", "Halloran", "Nakamura", "Osei", "Petrov", "Silva",
  "Bergman", "Adeyemi", "Costa", "Novak",
];
const HANDLE_SUFFIX = ["builds", "hq", "_dev", "writes", "ships", "irl", "codes", "___", "dot", "xyz"];

const FORMATS = ["short_text", "long_thread", "image", "carousel", "video", "poll"] as const;

export function buildPopulation(
  cohorts: AudienceCohort[],
  seed: number,
  totalPersonas = 48,
): SyntheticAudience {
  const rng = makeRng(seed);

  // Normalise shares so the population splits cleanly even if the model's
  // numbers don't quite sum to 1.
  const shareSum = cohorts.reduce((s, c) => s + c.populationShare, 0) || 1;

  const personas: SyntheticPersona[] = [];
  cohorts.forEach((c) => {
    const count = Math.max(4, Math.round((c.populationShare / shareSum) * totalPersonas));
    for (let i = 0; i < count; i++) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      personas.push({
        id: `p_${personas.length}`,
        handle: `${first.toLowerCase()}${rng.pick(HANDLE_SUFFIX)}`,
        displayName: `${first} ${last}`,
        cohortId: c.id,
        bio: `${rng.pick(c.coreInterests) ?? "building things"} · ${rng.pick(c.coreValues) ?? "craft"}`,
        interests: rng.sample(c.coreInterests, Math.min(2, c.coreInterests.length)),
        values: rng.sample(c.coreValues, Math.min(2, c.coreValues.length)),
        objections: rng.sample(c.commonObjections, Math.min(2, c.commonObjections.length)),
        purchasingTriggers: rng.sample(c.purchasingTriggers, Math.min(2, c.purchasingTriggers.length)),
        humor: Number(rng.around(c.baseline.humor).toFixed(2)),
        skepticism: Number(rng.around(c.baseline.skepticism).toFixed(2)),
        influence: Number(rng.around(c.baseline.influence, 0.28).toFixed(2)),
        persuadability: Number(rng.around(c.baseline.persuadability).toFixed(2)),
        preferredFormats: rng.sample(FORMATS, 2),
        engagement: {
          postRate: Number(rng.around(0.35).toFixed(2)),
          replyRate: Number(rng.around(0.4).toFixed(2)),
          repostRate: Number(rng.around(0.3).toFixed(2)),
          lurkRate: Number(rng.around(0.55).toFixed(2)),
        },
      });
    }
  });

  // Homophily within cohort plus a minority of cross-cohort bridges. The
  // bridges are what let a narrative escape its origin cluster.
  const edges: SyntheticAudience["edges"] = [];
  personas.forEach((p) => {
    const same = personas.filter((q) => q.cohortId === p.cohortId && q.id !== p.id);
    rng.sample(same, Math.min(5, same.length)).forEach((q) => {
      edges.push({ from: p.id, to: q.id, weight: Number(rng.around(0.6).toFixed(2)) });
    });
    if (rng.bool(0.35)) {
      const others = personas.filter((q) => q.cohortId !== p.cohortId);
      rng.sample(others, Math.min(2, others.length)).forEach((q) => {
        edges.push({ from: p.id, to: q.id, weight: Number(rng.around(0.3).toFixed(2)) });
      });
    }
  });

  return {
    cohorts,
    personas,
    edges,
    derivedFrom: [
      "Aggregate public discourse patterns",
      "Cohort baselines designed from category research",
      "Fictional archetypes — not modelled on identifiable individuals",
    ],
  };
}
