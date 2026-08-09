/**
 * The LLM provider interface.
 *
 * Two implementations satisfy this: `grok.ts` (real xAI calls) and `mock.ts`
 * (seeded, deterministic, offline). The app only ever talks to this interface,
 * so the entire demo runs identically with or without an API key — which is
 * the difference between a demo that survives bad conference wifi and one that
 * doesn't.
 */
import type { z } from "zod";

/**
 * Which generation task this call represents. Grok ignores it; the mock uses
 * it to dispatch to a hand-authored generator, because a schema-walking mock
 * produces structurally valid nonsense and the whole point of the offline path
 * is that the demo still looks real.
 */
export type GenTask =
  | "research"
  | "audience"
  | "strategies"
  | "findings"
  | "timeline"
  | "buildplan"
  | "edit"
  | "reaction";

export interface GenerateOptions {
  /** Deterministic seed. The mock uses it directly; Grok gets it as a hint. */
  seed?: number;
  temperature?: number;
  maxTokens?: number;
  /** Enables xAI's live X/web search tools for this call. */
  search?: "x" | "web" | "both" | "none";
  task?: GenTask;
  /** Arbitrary context the mock generators read (brief, cohorts, etc). */
  context?: Record<string, unknown>;
}

export interface ImageResult {
  /** Remote URL (Grok Imagine) or a data: URI (mock). */
  url: string;
  prompt: string;
  provider: "grok_imagine" | "mock";
}

export interface LlmProvider {
  readonly name: string;
  /** True when this provider makes real network calls. */
  readonly live: boolean;

  /**
   * Generate a value matching `schema`. Implementations must return data that
   * parses cleanly — validation happens inside, so callers get typed results
   * or an exception, never a half-valid object.
   */
  structured<T extends z.ZodTypeAny>(
    schema: T,
    system: string,
    user: string,
    opts?: GenerateOptions,
  ): Promise<z.infer<T>>;

  /** Free-form text, used for short reactive content inside the simulation. */
  text(system: string, user: string, opts?: GenerateOptions): Promise<string>;

  /** Grok Imagine, or a generated placeholder in mock mode. */
  image(prompt: string, opts?: { seed?: number; n?: number }): Promise<ImageResult[]>;
}
