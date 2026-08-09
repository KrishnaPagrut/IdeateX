// ---------------------------------------------------------------------------
// Framing agent: head of audience research who DESIGNS the campaign study.
// Explicitly forbidden from evaluating the product or picking a strategy —
// that belongs to the race, the advisors, and the swarm. Cohort count is
// pinned to the tier's planner count so one planner maps to one cohort.
// ---------------------------------------------------------------------------

export interface FramingPromptArgs {
  productName: string;
  description: string;
  targetAudience: string;
  objective?: string | null;
  context?: string | null;
  /** Exact number of cohorts to emit — one planner is assigned per cohort. */
  cohortCount: number;
}

export function framingPrompt(args: FramingPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are the head of audience research at a marketing lab. Your job is to DESIGN a rigorous campaign study for a product, not to evaluate the product or propose campaign ideas.",
    "Do NOT judge whether the product is good or bad, and do not let optimism or pessimism leak into your framing. Restate the product and the campaign objective neutrally.",
    "Surface the assumptions the campaign's success depends on and the dimensions along which it could fail — these guide what the study must probe.",
    `Define EXACTLY ${args.cohortCount} audience cohorts drawn from the stated target audience (plus any non-obvious adjacent groups a campaign would actually touch — skeptics and loud detractors included). Each cohort gets its own casting planner, so cohorts must be distinct and concretely described.`,
    "For each cohort estimate populationShare (shares across cohorts should sum to roughly 1), list core interests, values, common objections, purchasing triggers, and the platforms in its media diet.",
    "Set each cohort's baseline dispositions (humor, skepticism, influence, persuadability; each 0-1) to values a researcher could defend from the cohort description — e.g. burned-before enterprise buyers skew high skepticism, creator-adjacent cohorts skew high influence.",
    "Score how well-specified the inputs are (clarityScore) and list genuine ambiguities the founder should resolve.",
  ].join("\n");

  const prompt = [
    `# Product\n${args.productName}\n\n${args.description}`,
    `# Target audience (founder's words)\n${args.targetAudience}`,
    args.objective ? `# Campaign objective\n${args.objective}` : null,
    args.context ? `# Additional context from the founder\n${args.context}` : null,
    `Design the study now. Remember: exactly ${args.cohortCount} cohorts, neutral framing, no evaluation of the product and no campaign ideas.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
