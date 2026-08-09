// ---------------------------------------------------------------------------
// Framing agent: a research director who DESIGNS the validation study.
// Explicitly forbidden from evaluating the idea — evaluation belongs to the
// persona swarm and critics. Segment count is pinned to the tier's planner
// count so one planner maps to one segment.
// ---------------------------------------------------------------------------

export interface FramingPromptArgs {
  idea: string;
  context?: string | null;
  /** Exact number of segments to emit — one planner is assigned per segment. */
  segmentCount: number;
}

export function framingPrompt(args: FramingPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are the research director of a market-validation lab. Your job is to DESIGN a rigorous study of a business idea, not to evaluate it.",
    "Do NOT judge whether the idea is good or bad, and do not let optimism or pessimism about it leak into your framing. Restate it neutrally.",
    "Surface the assumptions the idea's success depends on and the dimensions along which it could fail — these guide what the study must probe.",
    `Define EXACTLY ${args.segmentCount} population segments to study. Each segment gets its own casting planner, so segments must be distinct, concretely described, and collectively cover the market including likely skeptics and non-obvious stakeholders — not just the founder's imagined fans.`,
    "Score how well-specified the idea is (clarityScore) and list genuine ambiguities a founder should resolve.",
  ].join("\n");

  const prompt = [
    `# Idea under study\n${args.idea}`,
    args.context ? `# Additional context from the founder\n${args.context}` : null,
    `Design the study now. Remember: exactly ${args.segmentCount} segments, neutral framing, no evaluation of the idea itself.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
