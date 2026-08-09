import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorVerdict,
  CampaignStrategy,
  RaceResult,
} from "@/lib/schemas/marketing";

// ---------------------------------------------------------------------------
// Advisor panel: three expert lenses read the SAME race evidence and argue
// for a winner; a moderator synthesizes their consensus. Advisors act on the
// simulation's public-consensus signal — they never invent audience data.
// ---------------------------------------------------------------------------

export interface AdvisorLens {
  key: string;
  label: string;
  briefing: string;
}

export const ADVISOR_LENSES: AdvisorLens[] = [
  {
    key: "brand",
    label: "Brand Strategist",
    briefing:
      "Judge positioning durability: which strategy builds an identity the brand can live in for years, not a spike. Weigh trust, message comprehension, and audience fit over raw reach. Punish angles that mortgage credibility for attention.",
  },
  {
    key: "growth",
    label: "Growth & Performance",
    briefing:
      "Judge conversion mechanics: which strategy moves purchase intent and share propensity per unit of reach. Look at cohort-level intent, where reach actually landed (targeted cohorts or spillover), and whether the CTA survives contact with the audience.",
  },
  {
    key: "community",
    label: "Community & PR Risk",
    briefing:
      "Judge how each strategy fails in public: detractor narratives, controversy, brand-safety risk, and which negative narratives have momentum. A strategy that wins the race but arms its critics may still be the wrong pick — say so with evidence.",
  },
];

function formatStrategies(strategies: CampaignStrategy[]): string {
  return strategies
    .map(
      (s) =>
        `## ${s.id} — ${s.name} (theme: ${s.theme})\nThesis: ${s.positioningThesis}\nCentral message: ${s.centralMessage}\nLaunch post (${s.sampleLaunchPost.platform}): ${s.sampleLaunchPost.body}\nCTA: ${s.callToAction}\nTargets: ${s.targetCohortIds.join(", ")}`,
    )
    .join("\n\n");
}

function formatRace(results: RaceResult[]): string {
  return results
    .map((r) => {
      const scores = Object.entries(r.scores)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ");
      const narratives =
        r.narratives.length > 0
          ? r.narratives
              .map(
                (n) =>
                  `  - "${n.label}" (sentiment ${n.sentiment.toFixed(2)}, momentum ${n.momentum.toFixed(1)}, ${n.carrierIds.length} carriers)`,
              )
              .join("\n")
          : "  - none formed";
      const cohorts = r.cohortState
        .map(
          (c) =>
            `  - ${c.cohortId}: reached ${c.reached}/${c.population}, sentiment ${c.sentiment}, intent ${c.purchaseIntent}`,
        )
        .join("\n");
      const replies = r.sampleReplies
        .map((x) => `  - [${x.sentiment >= 0 ? "+" : ""}${x.sentiment.toFixed(2)}${x.llmBacked ? ", pivotal" : ""}] "${x.body}"`)
        .join("\n");
      return `## ${r.strategyId} — ${r.strategyName}\nReach ${r.reachedCount}/${r.personaCount}. Scores: ${scores}\nNarratives that formed:\n${narratives}\nCohort outcomes:\n${cohorts}\nRepresentative audience replies:\n${replies}`;
    })
    .join("\n\n");
}

export interface AdvisorPromptArgs {
  productName: string;
  brief: MarketingBrief;
  strategies: CampaignStrategy[];
  race: RaceResult[];
  lens: AdvisorLens;
  grounded: boolean;
}

export function advisorPrompt(args: AdvisorPromptArgs): { system: string; prompt: string } {
  const system = [
    `You are the ${args.lens.label} on a campaign advisory panel. ${args.lens.briefing}`,
    "Three candidate strategies were raced through an identical synthetic audience. The scores are COMPARATIVE (rankings under identical conditions), not real-world forecasts — treat them as evidence about relative behavior, not absolute truth.",
    `Set \`lens\` to "${args.lens.label}". Rank ALL strategies (rank 1 = your pick) with an argument per strategy grounded in specific scores, narratives, cohort outcomes, or quoted replies — never in your own speculation about the audience.`,
    "Write directives: hard constraints the final campaign content must honor given what the race surfaced (e.g. 'answer pricing in the first post — the Pricing-is-unclear narrative had the most momentum'). Directives must trace to evidence.",
    args.grounded
      ? "You have web_search and x_search tools — you may pull real-world context (competitor moves, platform norms) to sharpen your arguments; cite what you use."
      : "Argue only from the evidence provided.",
  ].join("\n");

  const prompt = [
    `# Product\n${args.productName}: ${args.brief.productSummary}`,
    `# Campaign objective\n${args.brief.objectiveSummary}`,
    `# Candidate strategies\n${formatStrategies(args.strategies)}`,
    `# Race evidence (shared audience, identical conditions)\n${formatRace(args.race)}`,
    "Deliver your verdict now: ranking with arguments, directives, concerns.",
  ].join("\n\n");

  return { system, prompt };
}

export interface ModeratorPromptArgs {
  productName: string;
  brief: MarketingBrief;
  strategies: CampaignStrategy[];
  race: RaceResult[];
  verdicts: AdvisorVerdict[];
}

export function moderatorPrompt(args: ModeratorPromptArgs): { system: string; prompt: string } {
  const panel = args.verdicts
    .map(
      (v) =>
        `## ${v.lens}\nRanking: ${[...v.ranking]
          .sort((a, b) => a.rank - b.rank)
          .map((r) => `${r.rank}. ${r.strategyId} — ${r.argument}`)
          .join(" | ")}\nDirectives: ${v.directives.map((d) => d.directive).join("; ") || "none"}\nConcerns: ${v.concerns.join("; ") || "none"}`,
    )
    .join("\n\n");

  const system = [
    "You are the moderator of a campaign advisory panel. The advisors have argued; you now synthesize their consensus.",
    `\`winnerStrategyId\` MUST be one of: ${args.strategies.map((s) => s.id).join(", ")}.`,
    "Weigh the panel like a good chair: majority preference matters, but a decisive risk flagged by one advisor can override a shallow majority — explain your weighing in the rationale.",
    "agreements = points multiple advisors made independently. disagreements = genuine unresolved tensions, stated fairly. Do not manufacture consensus.",
    "Consolidate the advisors' directives into one deduplicated list (max 8) — these become HARD constraints on the campaign content. Keep each directive's evidence-based rationale.",
  ].join("\n");

  const prompt = [
    `# Product\n${args.productName}: ${args.brief.productSummary}`,
    `# Candidate strategies\n${args.strategies.map((s) => `${s.id} — ${s.name} (${s.theme})`).join("\n")}`,
    `# Final race scores\n${args.race.map((r) => `${r.strategyId}: ${Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(" · ")}`).join("\n")}`,
    `# The panel's verdicts\n${panel}`,
    "Synthesize the consensus now.",
  ].join("\n\n");

  return { system, prompt };
}
