import type { Aggregates } from "@/lib/engine/aggregate";
import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
  RaceResult,
} from "@/lib/schemas/marketing";

// ---------------------------------------------------------------------------
// Report synthesis: turns the race, the advisor consensus, and the deep-swarm
// evidence on the winner into a founder-ready marketing report with drafted,
// finding-traceable campaign content.
// ---------------------------------------------------------------------------

export interface QuoteForSynthesis {
  personaName: string;
  archetype: string;
  segment: string;
  adoptionLikelihood: number;
  quote: string;
}

export interface SynthesisPromptArgs {
  productName: string;
  description: string;
  objective?: string | null;
  context?: string | null;
  brief: MarketingBrief;
  winner: CampaignStrategy;
  consensus: AdvisorConsensus;
  verdicts: AdvisorVerdict[];
  race: RaceResult[];
  aggregates: Aggregates;
  quotes: QuoteForSynthesis[];
}

export function synthesisPrompt(args: SynthesisPromptArgs): { system: string; prompt: string } {
  const winnerRace = args.race.find((r) => r.strategyId === args.winner.id);
  const negativeNarratives = args.race
    .flatMap((r) => r.narratives)
    .filter((n) => n.sentiment < 0)
    .sort((a, b) => b.momentum - a.momentum);
  const detractorReplies = args.race
    .flatMap((r) => r.sampleReplies)
    .filter((x) => x.sentiment < -0.2);

  const system = [
    "You are the lead strategist writing the final campaign report for a founder who reads for two minutes and then has to act.",
    "Every claim must trace to evidence you were given — race scores, formed narratives, advisor arguments, or persona quotes. The sourceRef/answersFinding fields are the product: a draft that doesn't answer a specific finding is filler.",
    `The advisor panel's directives are HARD constraints on all drafted content:\n${args.consensus.directives.map((d) => `- ${d.directive} (${d.rationale})`).join("\n")}`,
    "Drafted content rules: X posts in the winning strategy's platform-native voice, ≤280 chars, no hashtag spam. The Reddit post must read like a community member's post that would survive moderation, not an ad — pick the subredditStyle from the target cohorts' actual media diets. Ad variants are direct-response: concrete claim, honest proof, one CTA.",
    "objectionLedger: take the negative narratives and repeated audience objections and write the honest rebuttal the brand should actually give — no spin that the audience already rejected in the sim.",
    "preMortem: ground the viral-failure thread in the actual detractor replies and negative narratives from the race (invented handles, realistic escalation), then a response plan a founder could execute within 24 hours.",
    "Verdict scale: launch_ready (ship the campaign as drafted), promising (ship after honoring the directives), needs_work (strategy won but the evidence demands changes first), high_risk (even the winner armed its critics).",
  ].join("\n");

  const quotes = args.quotes
    .map(
      (q) =>
        `- ${q.personaName} (${q.archetype}, "${q.segment}", adoption ${q.adoptionLikelihood}/100): "${q.quote}"`,
    )
    .join("\n");

  const prompt = [
    `# Product\n${args.productName}: ${args.description}`,
    args.objective ? `# Campaign objective\n${args.objective}` : null,
    args.context ? `# Founder context\n${args.context}` : null,
    `# Winning strategy (race + advisor pick)\n${JSON.stringify(args.winner, null, 2)}`,
    `# Advisor consensus\n${JSON.stringify(args.consensus, null, 2)}`,
    `# Race scores (all strategies, identical audience)\n${args.race.map((r) => `${r.strategyId} — ${r.strategyName}: ${Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(" · ")}`).join("\n")}`,
    winnerRace
      ? `# Winner's race detail\nNarratives: ${winnerRace.narratives.map((n) => `"${n.label}" (sentiment ${n.sentiment.toFixed(2)}, momentum ${n.momentum.toFixed(1)})`).join("; ") || "none"}\nCohorts: ${winnerRace.cohortState.map((c) => `${c.cohortId} reached ${c.reached}/${c.population} intent ${c.purchaseIntent}`).join("; ")}`
      : null,
    `# Negative narratives across the race (for the objection ledger)\n${negativeNarratives.map((n) => `- "${n.label}" momentum ${n.momentum.toFixed(1)}`).join("\n") || "none formed"}`,
    `# Detractor replies (for the pre-mortem)\n${detractorReplies.map((x) => `- "${x.body}"`).join("\n") || "none captured"}`,
    `# Deep-swarm results on the winner (full persona panel)\n${JSON.stringify(args.aggregates, null, 2)}`,
    `# Best verbatim persona quotes\n${quotes}`,
    "Write the report now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
