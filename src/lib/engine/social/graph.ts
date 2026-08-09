import type { AudienceEdge } from "@/lib/schemas/marketing";
import { hashSeed, makeRng } from "./rng";

// ---------------------------------------------------------------------------
// Seeded follow-graph generation: dense within cohorts, sparse weak ties
// across, influence-weighted (preferential attachment). Generated in code —
// free, deterministic, replayable — never asked of a model.
// ---------------------------------------------------------------------------

export interface GraphMember {
  personaId: string;
  cohort: string;
  /** 0-1; higher-influence members attract more followers. */
  influence: number;
}

const WITHIN_COHORT_FOLLOWS = 4;
const CROSS_COHORT_FOLLOWS = 2;

/** Weighted sample without replacement, weight = 0.2 + influence. */
function weightedSample(
  candidates: GraphMember[],
  count: number,
  rng: ReturnType<typeof makeRng>,
): GraphMember[] {
  const pool = [...candidates];
  const picked: GraphMember[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, m) => s + 0.2 + m.influence, 0);
    let roll = rng.next() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      roll -= 0.2 + pool[idx].influence;
      if (roll <= 0) break;
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

export function buildFollowGraph(members: GraphMember[], seed: number): AudienceEdge[] {
  const rng = makeRng(hashSeed(`graph:${seed}`));
  const byCohort = new Map<string, GraphMember[]>();
  for (const m of members) {
    const list = byCohort.get(m.cohort) ?? [];
    list.push(m);
    byCohort.set(m.cohort, list);
  }

  const edges: AudienceEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (from: GraphMember, to: GraphMember) => {
    const key = `${from.personaId}->${to.personaId}`;
    if (from.personaId === to.personaId || seen.has(key)) return;
    seen.add(key);
    edges.push({
      from: from.personaId,
      to: to.personaId,
      weight: Math.max(0, Math.min(1, 0.5 + to.influence * 0.5)),
    });
  };

  for (const m of members) {
    const cohortPeers = (byCohort.get(m.cohort) ?? []).filter(
      (p) => p.personaId !== m.personaId,
    );
    const outsiders = members.filter(
      (p) => p.cohort !== m.cohort && p.personaId !== m.personaId,
    );

    for (const target of weightedSample(cohortPeers, WITHIN_COHORT_FOLLOWS, rng)) {
      addEdge(m, target);
    }
    for (const target of weightedSample(outsiders, CROSS_COHORT_FOLLOWS, rng)) {
      addEdge(m, target);
    }

    // Everyone follows at least one account so no feed is permanently empty.
    if (![...seen].some((k) => k.startsWith(`${m.personaId}->`))) {
      const anyone = members.filter((p) => p.personaId !== m.personaId);
      if (anyone.length > 0) addEdge(m, rng.pick(anyone));
    }
  }

  return edges;
}
