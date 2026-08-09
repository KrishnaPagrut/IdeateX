import { EventEmitter } from "node:events";

import { eq, gt, and, asc } from "drizzle-orm";

import { db, runEvents } from "@/lib/db";
import type { RunEventMessage, RunEventType } from "@/lib/schemas/events";

// ---------------------------------------------------------------------------
// Event bus: every emit() persists to run_events (durable, replayable) AND
// pushes to an in-process emitter (low-latency SSE). SSE handlers replay from
// the table on connect, then follow the live emitter — no lost events.
//
// globalThis-scoped so Next.js dev-mode module re-evaluation reuses one bus.
// ---------------------------------------------------------------------------

const globalBus = globalThis as unknown as {
  __ideatexEventBus?: EventEmitter;
  __ideatexSeqCounters?: Map<string, number>;
};

const bus = (globalBus.__ideatexEventBus ??= new EventEmitter().setMaxListeners(100));
const seqCounters = (globalBus.__ideatexSeqCounters ??= new Map<string, number>());

function nextSeq(runId: string): number {
  const next = (seqCounters.get(runId) ?? 0) + 1;
  seqCounters.set(runId, next);
  return next;
}

/** Call once when a run starts so seq begins at 1 for a fresh run. */
export function initRunSequence(runId: string): void {
  seqCounters.set(runId, 0);
}

export async function emitRunEvent(
  runId: string,
  type: RunEventType,
  payload: Record<string, unknown>,
  agentRunId?: string,
): Promise<RunEventMessage> {
  const seq = nextSeq(runId);
  const message = { type, seq, payload } as RunEventMessage;

  await db.insert(runEvents).values({
    runId,
    seq,
    type,
    agentRunId: agentRunId ?? null,
    payload,
  });

  bus.emit(`run:${runId}`, message);
  return message;
}

export function subscribeToRun(
  runId: string,
  listener: (event: RunEventMessage) => void,
): () => void {
  const channel = `run:${runId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}

/** Replay persisted events after a given seq (0 = from the beginning). */
export async function replayRunEvents(runId: string, afterSeq: number): Promise<RunEventMessage[]> {
  const rows = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
    .orderBy(asc(runEvents.seq));

  return rows.map(
    (row) =>
      ({
        type: row.type,
        seq: row.seq,
        payload: row.payload,
      }) as RunEventMessage,
  );
}
