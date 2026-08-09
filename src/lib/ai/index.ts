/**
 * Provider selection.
 *
 * Real Grok when XAI_API_KEY is set, deterministic mock otherwise. In live
 * mode we still fall back to the mock on failure rather than surfacing an
 * error, because a demo that degrades gracefully beats one that shows a stack
 * trace. `providerStatus()` lets the UI say honestly which path produced what.
 */
import type { z } from "zod";
import { createGrokProvider } from "./grok";
import { createMockProvider } from "./mock";
import type { GenerateOptions, ImageResult, LlmProvider } from "./provider";

export * from "./provider";

const mock = createMockProvider();
const apiKey = process.env.XAI_API_KEY;
const grok = apiKey ? createGrokProvider(apiKey) : null;

let lastFallbackReason: string | null = null;

export function providerStatus() {
  return {
    live: Boolean(grok),
    name: grok ? "grok" : "mock",
    lastFallbackReason,
  };
}

/**
 * Wraps the live provider so any failure silently degrades to the mock. The
 * reason is recorded so the UI can show a "running on offline data" badge.
 */
export const ai: LlmProvider = {
  name: grok ? "grok" : "mock",
  live: Boolean(grok),

  async structured<T extends z.ZodTypeAny>(
    schema: T,
    system: string,
    user: string,
    opts?: GenerateOptions,
  ): Promise<z.infer<T>> {
    if (grok) {
      try {
        return await grok.structured(schema, system, user, opts);
      } catch (err) {
        lastFallbackReason = err instanceof Error ? err.message : String(err);
        console.warn("[ai] grok.structured failed, using mock:", lastFallbackReason);
      }
    }
    return mock.structured(schema, system, user, opts);
  },

  async text(system: string, user: string, opts?: GenerateOptions): Promise<string> {
    if (grok) {
      try {
        return await grok.text(system, user, opts);
      } catch (err) {
        lastFallbackReason = err instanceof Error ? err.message : String(err);
        console.warn("[ai] grok.text failed, using mock:", lastFallbackReason);
      }
    }
    return mock.text(system, user, opts);
  },

  async image(prompt: string, opts?: { seed?: number; n?: number }): Promise<ImageResult[]> {
    if (grok) {
      try {
        return await grok.image(prompt, opts);
      } catch (err) {
        lastFallbackReason = err instanceof Error ? err.message : String(err);
        console.warn("[ai] grok.image failed, using mock:", lastFallbackReason);
      }
    }
    return mock.image(prompt, opts);
  },
};
