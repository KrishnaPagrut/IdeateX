import type { MarketingBrief } from "@/lib/schemas/brief";

// ---------------------------------------------------------------------------
// Casting planner: writes a casting CONTRACT against the persona pool catalog
// (domain/subdomain pools of ~20-30 people). The engine resolves the contract
// to concrete personas within the run's persona budget — planners never see
// individual persona ids at library scale.
// ---------------------------------------------------------------------------

export interface PoolCatalogEntry {
  key: string; // "consumers/budget-households"
  name: string;
  description: string;
  available: number;
  /** Sample of descriptor labels seen on personas in this pool. */
  labels: string[];
}

export function formatPoolCatalog(pools: PoolCatalogEntry[]): string {
  return pools
    .map(
      (p) =>
        `${p.key} · ${p.name} (${p.available} people) — ${p.description}` +
        (p.labels.length > 0 ? ` Labels: ${p.labels.slice(0, 8).join(", ")}` : ""),
    )
    .join("\n");
}

export interface PlannerPromptArgs {
  brief: MarketingBrief;
  /** The cohort this planner casts for (cohort name doubles as segment key). */
  segment: {
    name: string;
    description: string;
    whyRelevant: string;
    commonObjections?: string[];
    purchasingTriggers?: string[];
  };
  poolCatalog: string;
  /** Total people this planner may request across all pools. */
  budget: number;
}

export function plannerPrompt(args: PlannerPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are a casting director for a market-research study. You write a casting contract: which persona POOLS to draw from, how many people from each, and what to probe. A resolver fills your contract with real people.",
    "Contract rules:",
    `- Request a TOTAL of ${args.budget} people across 1-4 pools. The \`pool\` of every request MUST be a key copied verbatim from the catalog — never invent pool keys.`,
    "- Optimize for REPRESENTATIVENESS of your segment, not enthusiasm: mix pools (and use mustInclude labels) to cover its internal diversity — age, income, tech comfort, attitude.",
    "- Ensure the mix predicts at least some DETRACTORS — draw from a pool or labels whose people are likely skeptical — so the study cannot become an echo chamber.",
    "- Per request, set `angle`: the lens people from this pool should evaluate the idea through (grounded in that pool's life, not generic).",
    "- Per request, write up to 3 probeQuestions that pressure-test the study's key assumptions and risk dimensions from that pool's perspective.",
    "- `mustInclude` labels are soft preferences matched against people's descriptor tags; leave empty when any pool member fits.",
  ].join("\n");

  const prompt = [
    `# Study brief\nProduct: ${args.brief.productSummary}\nCampaign objective: ${args.brief.objectiveSummary}\nKey assumptions: ${args.brief.keyAssumptions.join("; ")}\nRisk dimensions: ${args.brief.riskDimensions.join("; ")}`,
    `# Your assigned cohort\n${args.segment.name}: ${args.segment.description}\nWhy it matters: ${args.segment.whyRelevant}` +
      (args.segment.commonObjections?.length
        ? `\nCommon objections: ${args.segment.commonObjections.join("; ")}`
        : "") +
      (args.segment.purchasingTriggers?.length
        ? `\nPurchasing triggers: ${args.segment.purchasingTriggers.join("; ")}`
        : ""),
    `# Persona pool catalog (key · name (available) — description)\n${args.poolCatalog}`,
    `Write your casting contract now: ${args.budget} people total for cohort "${args.segment.name}".`,
  ].join("\n\n");

  return { system, prompt };
}

/** Appended for the single re-ask when a contract referenced unknown pools. */
export function plannerInvalidPoolsRetrySuffix(invalidPools: string[]): string {
  return [
    "",
    `Your previous contract referenced pools that do NOT exist in the catalog: ${invalidPools.join(", ")}.`,
    "Re-issue the complete casting contract using ONLY pool keys copied verbatim from the catalog above.",
  ].join("\n");
}
