import { eq } from "drizzle-orm";
import type { z } from "zod";

import { db, agentRuns, type AgentKind } from "@/lib/db";
import { generate, type GenerateArgs } from "@/lib/llm/client";
import { CostMeter } from "@/lib/llm/cost";
import { MODELS, type ModelRole, type ReasoningEffort } from "@/lib/llm/models";
import { withRetry } from "./concurrency";
import { emitRunEvent } from "./events";

// ---------------------------------------------------------------------------
// One LLM call = one agent_runs row, walked pending → running → completed/
// failed with paired agent:* events. Every stage funnels through executeAgent
// so the swarm graph, cost accounting, and event stream stay consistent.
// ---------------------------------------------------------------------------

export interface AgentContext {
  runId: string;
  signal: AbortSignal;
  meter: CostMeter;
}

export interface ExecuteAgentArgs<T> {
  ctx: AgentContext;
  kind: AgentKind;
  label: string;
  parentAgentRunId: string | null;
  personaId?: string | null;
  segment?: string | null;
  role: ModelRole;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  effort?: ReasoningEffort;
  tools?: GenerateArgs<T>["tools"];
  /**
   * Optional single re-ask: return null when the output is acceptable, or a
   * corrective suffix to append to the prompt for exactly one more attempt.
   * The second output is final either way (callers own any last fallback).
   */
  reask?: (output: T) => string | null;
}

export interface AgentResult<T> {
  agentRunId: string;
  output: T;
}

function agentEventPayload<T>(
  args: ExecuteAgentArgs<T>,
  agentRunId: string,
  status: "running" | "completed" | "failed",
  error?: string,
): Record<string, unknown> {
  return {
    agentRunId,
    kind: args.kind,
    label: args.label,
    status,
    parentAgentRunId: args.parentAgentRunId,
    personaId: args.personaId ?? null,
    segment: args.segment ?? null,
    ...(error ? { error } : {}),
  };
}

export async function executeAgent<T>(args: ExecuteAgentArgs<T>): Promise<AgentResult<T>> {
  const { ctx } = args;

  // Insert the row BEFORE calling the model so the graph node exists even if
  // the process dies mid-call.
  const [row] = await db
    .insert(agentRuns)
    .values({
      runId: ctx.runId,
      parentAgentRunId: args.parentAgentRunId,
      kind: args.kind,
      label: args.label,
      personaId: args.personaId ?? null,
      segment: args.segment ?? null,
      status: "pending",
      model: MODELS[args.role].id,
      systemPrompt: args.system,
      userPrompt: args.prompt,
    })
    .returning({ id: agentRuns.id });
  const agentRunId = row.id;

  await db
    .update(agentRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(agentRuns.id, agentRunId));
  await emitRunEvent(
    ctx.runId,
    "agent:started",
    agentEventPayload(args, agentRunId, "running"),
    agentRunId,
  );

  try {
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;

    const call = async (prompt: string) => {
      const result = await withRetry(
        () =>
          generate({
            role: args.role,
            schema: args.schema,
            system: args.system,
            prompt,
            effort: args.effort,
            tools: args.tools,
            abortSignal: ctx.signal,
          }),
        { signal: ctx.signal },
      );
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      costUsd += ctx.meter.add(args.role, result.inputTokens, result.outputTokens);
      return result;
    };

    let result = await call(args.prompt);
    let finalPrompt = args.prompt;
    if (args.reask) {
      const suffix = args.reask(result.object);
      if (suffix !== null) {
        finalPrompt = `${args.prompt}\n${suffix}`;
        result = await call(finalPrompt);
      }
    }

    await db
      .update(agentRuns)
      .set({
        status: "completed",
        userPrompt: finalPrompt,
        output: result.object as Record<string, unknown>,
        rawText: result.rawText,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        model: result.model,
        finishedAt: new Date(),
      })
      .where(eq(agentRuns.id, agentRunId));

    await emitRunEvent(
      ctx.runId,
      "agent:completed",
      agentEventPayload(args, agentRunId, "completed"),
      agentRunId,
    );
    await emitRunEvent(ctx.runId, "cost:update", { totalUsd: ctx.meter.total });

    return { agentRunId, output: result.object };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(agentRuns)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));
    await emitRunEvent(
      ctx.runId,
      "agent:failed",
      agentEventPayload(args, agentRunId, "failed", message),
      agentRunId,
    );
    throw error;
  }
}
