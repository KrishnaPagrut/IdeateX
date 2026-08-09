import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import type { RunEventMessage } from "@/lib/schemas/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db/engine imported lazily inside the handler — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "stale"]);

const HEARTBEAT_MS = 15_000;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/runs/[runId]/events">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const [{ db, runs }, { replayRunEvents, subscribeToRun }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/engine/events"),
  ]);

  const [run] = await db.select({ id: runs.id }).from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  // Resume point: SSE Last-Event-ID header carries the last seq the client saw.
  const lastEventId = Number.parseInt(request.headers.get("last-event-id") ?? "0", 10);
  const afterSeq = Number.isFinite(lastEventId) && lastEventId > 0 ? lastEventId : 0;

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send = (event: RunEventMessage) =>
        write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);

      const heartbeat = setInterval(() => write(`: heartbeat\n\n`), HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // controller already closed by the runtime
        }
      };

      let maxSeq = afterSeq;
      const pending: RunEventMessage[] = [];
      let replaying = true;

      const deliver = (event: RunEventMessage) => {
        if (closed || event.seq <= maxSeq) return;
        maxSeq = event.seq;
        send(event);
        // Terminal status is the last event of a run: end the stream so the
        // client's EventSource does not reconnect forever.
        if (event.type === "run:status" && TERMINAL_STATUSES.has(event.payload.status)) {
          close();
        }
      };

      // Subscribe BEFORE replaying so nothing emitted mid-replay is lost;
      // live events are buffered until the replay finishes, then deduped by seq.
      const unsubscribe = subscribeToRun(runId, (event) => {
        if (replaying) pending.push(event);
        else deliver(event);
      });

      cleanup = close;
      request.signal.addEventListener("abort", close);

      const replayed = await replayRunEvents(runId, afterSeq);
      for (const event of replayed) deliver(event);
      replaying = false;
      for (const event of pending) deliver(event);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
