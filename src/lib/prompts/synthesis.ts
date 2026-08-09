import type { Aggregates } from "@/lib/engine/aggregate";
import type { Brief } from "@/lib/schemas/brief";
import type { Critique } from "@/lib/schemas/critique";

// ---------------------------------------------------------------------------
// Synthesis: turns brief + aggregates + critiques + best quotes into a
// founder-ready readout. 90-second read, every claim traceable, no filler.
// ---------------------------------------------------------------------------

export interface QuoteForSynthesis {
  personaName: string;
  archetype: string;
  segment: string;
  adoptionLikelihood: number;
  quote: string;
}

export interface SynthesisPromptArgs {
  idea: string;
  context?: string | null;
  brief: Brief;
  aggregates: Aggregates;
  methodologyCritique: Critique;
  redTeamCritique: Critique;
  quotes: QuoteForSynthesis[];
}

export function synthesisPrompt(args: SynthesisPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are the lead analyst writing the final readout of a simulated market-validation study.",
    "Write for a founder who reads for 90 seconds: verdict first, then only what changes their next decision.",
    "Every claim must trace to segment data in the aggregates or to a critique finding — no invented facts, no hedging filler (\"it depends\", \"more research is needed\") unless a critique concretely justifies it.",
    "Respect the critics: if the methodology critique undermines the sample, temper confidence; if the red-team surfaced real headwinds, they belong in topRisks. segmentSummaries must use the real per-segment means from the aggregates.",
    "boldestBet is the single highest-leverage change to the idea, not a platitude. nextSteps are concrete actions a founder could start this week.",
  ].join("\n");

  const quotes = args.quotes
    .map(
      (q) =>
        `- ${q.personaName} (${q.archetype}, "${q.segment}", adoption ${q.adoptionLikelihood}/100): "${q.quote}"`,
    )
    .join("\n");

  const prompt = [
    `# The idea\n${args.idea}`,
    args.context ? `# Founder context\n${args.context}` : null,
    `# Study brief\n${JSON.stringify(args.brief, null, 2)}`,
    `# Aggregate results\n${JSON.stringify(args.aggregates, null, 2)}`,
    `# Methodology critique (of the study)\n${JSON.stringify(args.methodologyCritique, null, 2)}`,
    `# Red-team critique (of the idea)\n${JSON.stringify(args.redTeamCritique, null, 2)}`,
    `# Best verbatim quotes\n${quotes}`,
    "Write the readout now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
