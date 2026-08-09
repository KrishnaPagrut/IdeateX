import type { MarketingBrief } from "@/lib/schemas/brief";
import type {
  AdvisorConsensus,
  AdvisorVerdict,
  CampaignStrategy,
} from "@/lib/schemas/marketing";
import type { MarketingReport } from "@/lib/schemas/report";

// ---------------------------------------------------------------------------
// Launch-kit timeline: expand the WINNING strategy into a dated execution
// plan. Ported from LaunchLab's generateTimeline (kavya/scaffold history) —
// the advisory panel's directives are passed as hard constraints so the plan
// is visibly a consequence of the run, not generic marketing advice.
// ---------------------------------------------------------------------------

export interface TimelinePromptArgs {
  productName: string;
  description: string;
  objective?: string | null;
  brief: MarketingBrief;
  winner: CampaignStrategy;
  consensus: AdvisorConsensus;
  verdicts: AdvisorVerdict[];
  synthesis: MarketingReport;
}

export function timelinePrompt(args: TimelinePromptArgs): { system: string; prompt: string } {
  const system = [
    "You expand a campaign strategy into a concrete, dated execution plan.",
    "You MUST honour every directive from the advisory panel — they are constraints, not suggestions.",
    "Produce a realistic mix across the launch window: teasers before launch (negative dayOffset), a launch-day cluster (several items at dayOffset 0), and follow-ups after (positive dayOffset).",
    "Every item's `purpose` must trace to a specific advisory directive, concern, or race finding — name it. An item whose purpose doesn't answer one of them is filler.",
    "Copy is platform-native: write for the platform the item ships on (register, length, formatting), not a generic press release.",
    "imagePrompt rules: a concrete visual brief — subject, style, mood — and it must explicitly say the image contains no text overlays, no lettering, no logos (the image model renders text poorly). Omit imagePrompt-worthy detail from copy-only items only if an image genuinely adds nothing.",
  ].join("\n");

  // Advisory directives + concerns become the constraint block; the report's
  // objection ledger and pre-mortem supply the risks each plan must answer.
  const directives = [
    ...args.consensus.directives.map((d) => `- [consensus] ${d.directive} (${d.rationale})`),
    ...args.verdicts.flatMap((v) => [
      ...v.directives.map((d) => `- [${v.lens}] ${d.directive} (${d.rationale})`),
      ...v.concerns.map((c) => `- [${v.lens} — concern] ${c}`),
    ]),
  ];

  const risks = [
    ...args.synthesis.objectionLedger.map((o) => `- Objection (${o.source}): ${o.objection}`),
    `- Pre-mortem scenario: ${args.synthesis.preMortem.scenario}`,
  ];

  const w = args.winner;
  const prompt = [
    `# Product\n${args.productName}: ${args.description}`,
    args.objective ? `# Campaign objective\n${args.objective}` : null,
    `# Winning strategy (race + advisor pick)\nName: ${w.name}\nPositioning thesis: ${w.positioningThesis}\nCentral message: ${w.centralMessage}\nTarget cohorts: ${w.targetCohortIds.join(", ")}\nCall to action: ${w.callToAction}\nSample launch post (${w.sampleLaunchPost.platform}): ${w.sampleLaunchPost.body}\nContent mix: ${w.contentMix
      .map((m) => `${m.format} on ${m.platform} (weight ${m.weight})`)
      .join(", ")}`,
    `# Audience cohorts (use these exact names in targetCohorts)\n${args.brief.cohorts
      .map((c) => `- ${c.name}: ${c.description}`)
      .join("\n")}`,
    `# DIRECTIVES FROM THE ADVISORY PANEL (hard constraints)\n${directives.join("\n")}`,
    `# TOP RISKS FROM THE FINAL REPORT (the plan must answer these)\n${risks.join("\n")}`,
    "Expand the winning strategy into the dated plan now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
