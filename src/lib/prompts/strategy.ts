import type { MarketingBrief } from "@/lib/schemas/brief";
import type { CreativeTheme } from "@/lib/schemas/marketing";

// ---------------------------------------------------------------------------
// Strategist: one call per creative direction, so the three strategies come
// from genuinely different starting points instead of one call splitting the
// difference three ways.
// ---------------------------------------------------------------------------

export interface StrategyDirection {
  key: string;
  label: string;
  /** Themes this strategist may choose between (schema enum values). */
  allowedThemes: CreativeTheme[];
  briefing: string;
}

export const STRATEGY_DIRECTIONS: StrategyDirection[] = [
  {
    key: "humor-led",
    label: "Humor-led",
    allowedThemes: ["memes", "founder_led"],
    briefing:
      "Win attention first, explain second. Meme-literate, self-aware, platform-native humor — the kind insiders repost. Never corporate-trying-to-be-funny.",
  },
  {
    key: "proof-led",
    label: "Proof-led",
    allowedThemes: ["educational", "direct_response"],
    briefing:
      "Win trust with receipts. Real numbers, before/after, teach-something-useful content, unambiguous pricing and CTA. Built for skeptics who investigate before they buy.",
  },
  {
    key: "aspiration-led",
    label: "Aspiration-led",
    allowedThemes: ["aspirational", "serious"],
    briefing:
      "Win identity. Paint who the buyer becomes with the product; recruit high-influence voices; premium tone, restrained claims. Built for sharing, not selling.",
  },
];

export interface StrategyPromptArgs {
  productName: string;
  description: string;
  objective?: string | null;
  brief: MarketingBrief;
  direction: StrategyDirection;
}

export function strategyPrompt(args: StrategyPromptArgs): { system: string; prompt: string } {
  const cohorts = args.brief.cohorts
    .map(
      (c) =>
        `- ${c.name} (${Math.round(c.populationShare * 100)}%): ${c.description} Objections: ${c.commonObjections.join("; ")}. Triggers: ${c.purchasingTriggers.join("; ")}. Platforms: ${c.mediaDiet.join(", ")}.`,
    )
    .join("\n");

  const system = [
    "You are a campaign strategist designing ONE complete launch strategy for a product. Two rival strategists are working other angles; yours must be distinctly itself, not a compromise.",
    `Your assigned direction — ${args.direction.label}: ${args.direction.briefing}`,
    `Your \`theme\` MUST be one of: ${args.direction.allowedThemes.join(", ")}.`,
    "`targetCohortIds` must be cohort NAMES copied verbatim from the audience list — target the cohorts your direction can actually win, not all of them.",
    "The sampleLaunchPost is the single most important field: it seeds a social simulation. Write it as a real post for its platform — platform-native voice, concrete, no marketing-speak. It must answer the loudest cohort objection implicitly rather than reading like an ad.",
    "positioningThesis states why this angle beats the obvious alternative. contentMix weights should reflect where your target cohorts actually are (their media diets).",
  ].join("\n");

  const prompt = [
    `# Product\n${args.productName}\n\n${args.description}`,
    args.objective ? `# Campaign objective\n${args.objective}` : null,
    `# Audience cohorts (from research)\n${cohorts}`,
    `# Study assumptions to respect\n${args.brief.keyAssumptions.join("; ") || "none listed"}`,
    `Design the complete ${args.direction.label} strategy now.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}

/** Appended for the single re-ask when targetCohortIds referenced unknown cohorts. */
export function strategyInvalidCohortsRetrySuffix(invalid: string[], valid: string[]): string {
  return [
    "",
    `Your previous strategy targeted cohorts that do not exist: ${invalid.join(", ")}.`,
    `Re-issue the complete strategy using ONLY cohort names from: ${valid.join(", ")}.`,
  ].join("\n");
}
