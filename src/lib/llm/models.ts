// ---------------------------------------------------------------------------
// Single source of truth for xAI model IDs and pricing.
// If xAI renames models, fix it HERE and run `pnpm verify-models` to confirm
// the IDs resolve against GET /v1/models.
// ---------------------------------------------------------------------------

export interface ModelInfo {
  id: string;
  /** USD per 1M input tokens (<200k-token requests) */
  inputPerM: number;
  /** USD per 1M output tokens */
  outputPerM: number;
  /** Whether the model accepts providerOptions.xai.reasoningEffort */
  supportsReasoningEffort: boolean;
}

export const MODELS = {
  /** Deep reasoning: framing, planners, critics, synthesis */
  reasoner: {
    id: "grok-4.5",
    inputPerM: 2.0,
    outputPerM: 6.0,
    supportsReasoningEffort: true,
  },
  /** High-volume persona swarm — cheap, fast, no reasoning tokens */
  swarm: {
    id: "grok-4.20-0309-non-reasoning",
    inputPerM: 1.25,
    outputPerM: 2.5,
    supportsReasoningEffort: false,
  },
  /** Persona library generation — cheap with optional light reasoning */
  generator: {
    id: "grok-4.3",
    inputPerM: 1.25,
    outputPerM: 2.5,
    supportsReasoningEffort: true,
  },
} as const satisfies Record<string, ModelInfo>;

export type ModelRole = keyof typeof MODELS;

export type ReasoningEffort = "none" | "low" | "medium" | "high";
