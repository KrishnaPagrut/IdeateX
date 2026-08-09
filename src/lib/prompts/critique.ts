import type { Aggregates, VerdictRecord } from "@/lib/engine/aggregate";
import type { Brief } from "@/lib/schemas/brief";

// ---------------------------------------------------------------------------
// Two critics with opposite targets:
// - methodology critic attacks the STUDY (sycophancy, consensus artifacts,
//   sample bias) using aggregates + sampled raw verdicts;
// - red-team critic attacks the IDEA with market reality (optionally grounded
//   via server-side web/X search tools).
// ---------------------------------------------------------------------------

function formatVerdictSample(records: VerdictRecord[]): string {
  return records
    .map((r) => {
      const v = r.verdict;
      const wtp = v.willingnessToPay
        ? `${v.willingnessToPay.amount} ${v.willingnessToPay.currency} ${v.willingnessToPay.cadence}`
        : "n/a";
      return [
        `- ${r.personaName} (${r.archetype}, segment "${r.segment}", income ${r.incomeBand})`,
        `  adoption ${v.adoptionLikelihood}/100 · ${v.emotionalReaction} · wtp ${wtp} · recommend ${v.wouldRecommend} · confidence ${v.confidence}`,
        `  objections: ${v.topObjections.join("; ") || "none"}`,
        `  quote: "${v.verbatimQuote}"`,
      ].join("\n");
    })
    .join("\n");
}

export interface MethodologyCritiquePromptArgs {
  brief: Brief;
  aggregates: Aggregates;
  sampledVerdicts: VerdictRecord[];
}

export function methodologyCritiquePrompt(args: MethodologyCritiquePromptArgs): {
  system: string;
  prompt: string;
} {
  const system = [
    "You are a methodology critic reviewing a simulated market-validation study run on LLM-driven personas. Your target is the STUDY, not the idea.",
    "Attack the study's validity: sycophancy (LLM personas being too agreeable), consensus artifacts (suspiciously uniform scores or repeated phrasings), sample bias (segments or picks skewed toward fans), leading probe questions, and anything else that would make a real researcher distrust the aggregate signal.",
    "Set stance to \"methodology\". Every finding needs concrete evidence from the aggregates or the sampled verdicts. Finish with adjustedConfidence: how much the aggregate signal deserves to be trusted after your critique.",
  ].join("\n");

  const prompt = [
    `# Study design\nIdea: ${args.brief.ideaSummary}\nSegments: ${args.brief.segments.map((s) => s.name).join("; ")}\nKey assumptions probed: ${args.brief.keyAssumptions.join("; ")}`,
    `# Aggregate results\n${JSON.stringify(args.aggregates, null, 2)}`,
    `# Sampled raw verdicts (${args.sampledVerdicts.length})\n${formatVerdictSample(args.sampledVerdicts)}`,
    "Critique the study now.",
  ].join("\n\n");

  return { system, prompt };
}

export interface RedTeamCritiquePromptArgs {
  brief: Brief;
  idea: string;
  context?: string | null;
  aggregates: Aggregates;
  /** Whether server-side search tools are available for grounding. */
  grounded: boolean;
}

export function redTeamCritiquePrompt(args: RedTeamCritiquePromptArgs): {
  system: string;
  prompt: string;
} {
  const system = [
    "You are a red-team critic. Your target is the IDEA itself: attack it with market reality.",
    "Bring competitors, failed precedents, unit economics, distribution and switching-cost problems, regulatory exposure, and market-timing risk. Where the simulated study looks rosier than reality, say exactly why.",
    args.grounded
      ? "You have web_search and x_search tools — use them to pull real competitors, precedents, and market evidence, and cite what you find in contraryEvidence."
      : "Argue from established market knowledge; be specific about companies and precedents you are confident in.",
    "Set stance to \"redteam\". Finish with adjustedConfidence: your confidence in the study's aggregate signal once real-world headwinds are priced in.",
  ].join("\n");

  const prompt = [
    `# The idea\n${args.idea}`,
    args.context ? `# Founder context\n${args.context}` : null,
    `# How the study framed it\nSummary: ${args.brief.ideaSummary}\nTarget market: ${args.brief.targetMarket}\nRisk dimensions already identified: ${args.brief.riskDimensions.join("; ")}`,
    `# What the simulated panel concluded\n${JSON.stringify(args.aggregates, null, 2)}`,
    "Attack the idea now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
