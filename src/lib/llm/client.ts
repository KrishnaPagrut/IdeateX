import { xai } from "@ai-sdk/xai";
import { generateText, Output } from "ai";
import type { z } from "zod";

import { mockGenerate } from "./mock";
import { MODELS, type ModelRole, type ReasoningEffort } from "./models";

export interface GenerateArgs<T> {
  role: ModelRole;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  effort?: ReasoningEffort;
  /** Sampling temperature — raise for generation diversity (e.g. persona seeding). */
  temperature?: number;
  /** xAI server-side tools (web_search / x_search). Responses API only. */
  tools?: Parameters<typeof generateText>[0]["tools"];
  abortSignal?: AbortSignal;
}

export interface GenerateResult<T> {
  object: T;
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export function isMock(): boolean {
  return process.env.MOCK_LLM === "1";
}

/**
 * The single entry point for every LLM call in the app.
 * Structured output via AI SDK 7's `generateText` + `Output.object`.
 * Retries are owned by the caller (engine/concurrency.ts), not here.
 */
export async function generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
  if (isMock()) return mockGenerate(args);

  const info = MODELS[args.role];
  const providerOptions =
    args.effort && info.supportsReasoningEffort
      ? { xai: { reasoningEffort: args.effort } }
      : undefined;

  const result = await generateText({
    model: xai(info.id),
    system: args.system,
    prompt: args.prompt,
    output: Output.object({ schema: args.schema }),
    tools: args.tools,
    temperature: args.temperature,
    providerOptions,
    abortSignal: args.abortSignal,
    maxRetries: 0,
  });

  return {
    object: result.output as T,
    rawText: result.text,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    model: info.id,
  };
}
