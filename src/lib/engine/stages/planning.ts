import { eq } from "drizzle-orm";

import { db, personas, runs, type Persona, type Run } from "@/lib/db";
import { isMock } from "@/lib/llm/client";
import { TIER_SHAPE } from "@/lib/llm/cost";
import { findSubdomain } from "@/lib/personas/taxonomy";
import { listCustomPools } from "@/lib/personas/custom-pools";
import { buildFollowGraph } from "../social/graph";
import { hashSeed } from "../social/rng";
import { deriveTraits } from "../social/traits";
import {
  formatPoolCatalog,
  plannerInvalidPoolsRetrySuffix,
  plannerPrompt,
  type PoolCatalogEntry,
} from "@/lib/prompts/planner";
import type { MarketingBrief } from "@/lib/schemas/brief";
import { CastingSpecSchema, type CastingSpec } from "@/lib/schemas/casting";
import type { SimTraits, SyntheticAudience } from "@/lib/schemas/marketing";
import { executeAgent, type AgentContext } from "../agent";

// ---------------------------------------------------------------------------
// Planning: one casting planner per segment, all in parallel. Planners write
// casting CONTRACTS against the pool catalog (domain/subdomain groups of the
// live library); the resolver samples real personas per request, softly
// honoring mustInclude labels, and scales the whole cast down to the run's
// persona budget. Unknown pools get one re-ask, then a random fallback.
// ---------------------------------------------------------------------------

export interface CastingPick {
  personaId: string;
  segment: string;
  angle: string;
  probeQuestions: string[];
  plannerAgentId: string;
}

export interface PlanningResult {
  picks: CastingPick[];
  personaById: Map<string, Persona>;
  /** The frozen population every strategy races against; persisted on the run. */
  audience: SyntheticAudience;
}

const FALLBACK_ANGLE =
  "React as a typical member of this segment encountering the idea for the first time.";

function sample<T>(pool: T[], n: number): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function poolKey(p: Persona): string {
  return `${p.domain}/${p.subdomain}`;
}

/**
 * Catalog of pools actually present in the library (taxonomy and custom-pool
 * definitions add names/descriptions).
 */
function buildCatalog(
  library: Persona[],
  customByKey: Map<string, { name: string; description: string }> = new Map(),
): {
  catalog: PoolCatalogEntry[];
  byPool: Map<string, Persona[]>;
} {
  const byPool = new Map<string, Persona[]>();
  for (const p of library) {
    const key = poolKey(p);
    const list = byPool.get(key) ?? [];
    list.push(p);
    byPool.set(key, list);
  }

  const catalog = [...byPool.entries()].map(([key, members]) => {
    const [domainKey, subdomainKey] = key.split("/");
    const sub = findSubdomain(domainKey, subdomainKey) ?? customByKey.get(key);
    const labelCounts = new Map<string, number>();
    for (const m of members) {
      for (const tag of m.tags) labelCounts.set(tag, (labelCounts.get(tag) ?? 0) + 1);
    }
    const labels = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return {
      key,
      name: sub?.name ?? key,
      description: sub?.description ?? `People in the ${key} pool.`,
      available: members.length,
      labels,
    };
  });

  return { catalog: catalog.sort((a, b) => a.key.localeCompare(b.key)), byPool };
}

/** Soft label filter: prefer label matches, fall back to the whole pool. */
function preferLabels(members: Persona[], mustInclude: string[]): Persona[] {
  if (mustInclude.length === 0) return members;
  const needles = mustInclude.map((l) => l.toLowerCase());
  const matched = members.filter((p) => {
    const haystack = [p.archetype, ...p.tags].join(" ").toLowerCase();
    return needles.some((n) => haystack.includes(n));
  });
  return matched.length > 0 ? matched : members;
}

/** Resolve one planner's contract to concrete personas (within its budget). */
function resolveSpec(
  spec: CastingSpec,
  byPool: Map<string, Persona[]>,
  budget: number,
  segmentName: string,
  plannerAgentId: string,
  library: Persona[],
): CastingPick[] {
  const picks: CastingPick[] = [];
  const taken = new Set<string>();

  const requested = spec.requests.reduce((sum, r) => sum + r.count, 0);
  // Scale requests down proportionally when the contract exceeds the budget.
  const scale = requested > budget ? budget / requested : 1;

  for (const request of spec.requests) {
    const members = byPool.get(request.pool);
    if (!members || members.length === 0) continue;
    const want = Math.max(1, Math.round(request.count * scale));
    const candidates = preferLabels(members, request.mustInclude).filter(
      (p) => !taken.has(p.id),
    );
    for (const persona of sample(candidates, want)) {
      taken.add(persona.id);
      picks.push({
        personaId: persona.id,
        segment: segmentName,
        angle: request.angle,
        probeQuestions: request.probeQuestions,
        plannerAgentId,
      });
    }
  }

  if (picks.length === 0) {
    // Contract resolved to nothing (all pools unknown/empty) → random fallback.
    return sample(library, Math.min(budget, library.length)).map((p) => ({
      personaId: p.id,
      segment: segmentName,
      angle: FALLBACK_ANGLE,
      probeQuestions: [],
      plannerAgentId,
    }));
  }
  return picks;
}

export async function runPlanningStage(
  ctx: AgentContext,
  run: Run,
  brief: MarketingBrief,
  framingAgentId: string,
): Promise<PlanningResult> {
  const shape = TIER_SHAPE[run.tier];

  const library = await db.select().from(personas).where(eq(personas.active, true));
  if (library.length === 0) {
    throw new Error("no_active_personas: seed the persona library before starting a run");
  }
  const personaById = new Map(library.map((p) => [p.id, p]));
  const customByKey = new Map(
    (await listCustomPools()).map((c) => [
      `${c.domain}/${c.subdomain}`,
      { name: c.name, description: c.description },
    ]),
  );
  const { catalog, byPool } = buildCatalog(library, customByKey);
  const poolCatalog = formatPoolCatalog(catalog);
  const validPools = new Set(catalog.map((c) => c.key));

  const runBudget = Math.min(run.personaBudget ?? shape.personaTotal, library.length);
  const perPlannerBudget = Math.max(3, Math.floor(runBudget / shape.planners));

  const plannerJobs = Array.from({ length: shape.planners }, (_, i) => {
    // The framing prompt pins cohort count to planner count, but tolerate a
    // shorter list (e.g. schema-min mock briefs) by cycling cohorts.
    const segment = brief.cohorts[i % brief.cohorts.length];
    return { index: i, segment };
  });

  const perPlanner = await Promise.all(
    plannerJobs.map(async ({ index, segment }) => {
      const { system, prompt } = plannerPrompt({
        brief,
        segment,
        poolCatalog,
        budget: perPlannerBudget,
      });

      const { agentRunId, output } = await executeAgent({
        ctx,
        kind: "planner",
        label: `Planner ${index + 1} · ${segment.name}`,
        parentAgentRunId: framingAgentId,
        segment: segment.name,
        role: "reasoner",
        schema: CastingSpecSchema,
        system,
        prompt,
        effort: "medium",
        // One re-ask when the contract references unknown pools (real mode
        // only — mock contracts always reference fake pools and fall back).
        reask: isMock()
          ? undefined
          : (spec) => {
              const invalid = spec.requests
                .map((r) => r.pool)
                .filter((pool) => !validPools.has(pool));
              return invalid.length > 0 ? plannerInvalidPoolsRetrySuffix(invalid) : null;
            },
      });

      return resolveSpec(
        output,
        byPool,
        perPlannerBudget,
        segment.name,
        agentRunId,
        library,
      );
    }),
  );

  // Dedupe across planners: the first planner to cast a persona keeps them.
  const deduped = new Map<string, CastingPick>();
  for (const pick of perPlanner.flat()) {
    if (!deduped.has(pick.personaId)) deduped.set(pick.personaId, pick);
  }

  // Final budget clamp across the whole cast (planners may round up).
  const all = [...deduped.values()].slice(0, runBudget);

  const audience = buildAudience(run, brief, all, personaById);
  await db
    .update(runs)
    .set({ audience: audience as unknown as Record<string, unknown> })
    .where(eq(runs.id, run.id));

  return { picks: all, personaById, audience };
}

// ---------------------------------------------------------------------------
// Audience assembly: cast personas become sim members. Traits derive
// deterministically from persona psychographics blended with the cohort
// baseline; the follow graph is seeded preferential attachment. Same run id →
// identical audience, so every race sim replays.
// ---------------------------------------------------------------------------

const DEFAULT_BASELINE: SimTraits = {
  humor: 0.5,
  skepticism: 0.5,
  influence: 0.4,
  persuadability: 0.5,
};

function buildAudience(
  run: Run,
  brief: MarketingBrief,
  picks: CastingPick[],
  personaById: Map<string, Persona>,
): SyntheticAudience {
  const seed = hashSeed(run.id);
  const baselineByCohort = new Map(brief.cohorts.map((c) => [c.name, c.baseline]));

  const members = picks.flatMap((pick) => {
    const persona = personaById.get(pick.personaId);
    if (!persona) return [];
    const baseline = baselineByCohort.get(pick.segment) ?? DEFAULT_BASELINE;
    const { traits, engagement } = deriveTraits(persona, baseline, seed);
    return [{ personaId: persona.id, cohort: pick.segment, traits, engagement }];
  });

  const edges = buildFollowGraph(
    members.map((m) => ({
      personaId: m.personaId,
      cohort: m.cohort,
      influence: m.traits.influence,
    })),
    seed,
  );

  return { members, edges, seed };
}
