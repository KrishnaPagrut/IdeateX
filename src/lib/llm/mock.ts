import { MODELS } from "./models";
import type { GenerateArgs, GenerateResult } from "./client";

/**
 * Mock adapter for MOCK_LLM=1: returns schema-valid canned data with realistic
 * latency so the full pipeline (and its visualization) runs with zero API cost.
 *
 * Uses zod v4's builtin mock-ish path: we synthesize values by parsing
 * hand-rolled defaults per schema shape. Stage-specific fixtures live in
 * `src/fixtures/` and are matched by schema description; anything unmatched
 * falls back to schema-driven synthesis.
 */
import { synthesizeFromSchema } from "./mock-synthesize";

const MOCK_FAILURE_RATE = Number(process.env.MOCK_LLM_FAILURE_RATE ?? 0);

export async function mockGenerate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
  const delayMs = 50 + Math.random() * 400;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    args.abortSignal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

  if (MOCK_FAILURE_RATE > 0 && Math.random() < MOCK_FAILURE_RATE) {
    throw new Error("mock: injected failure");
  }

  const object = synthesizeFromSchema(args.schema);
  return {
    object,
    rawText: JSON.stringify(object),
    inputTokens: Math.round(500 + Math.random() * 2_000),
    outputTokens: Math.round(200 + Math.random() * 1_000),
    model: `mock:${MODELS[args.role].id}`,
  };
}
