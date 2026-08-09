import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import type { ImageStreamEvent } from "@/lib/schemas/launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// db imported lazily inside the handler — see src/app/api/runs/route.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many images to generate at once — fast, but under rate limits. */
const CONCURRENCY = 3;

const HEARTBEAT_MS = 15_000;

/**
 * Runs currently generating. A reconnect (second tab, SSE retry) while a
 * stream is mid-flight must not kick off duplicate work for the same items.
 */
const inFlight = new Set<string>();

/**
 * Streams generated campaign-item images as they complete.
 *
 * Image generation is the slowest step, so nothing blocks on it: the launch
 * kit renders with placeholder tiles, the client opens this stream, and each
 * finished image is persisted THEN pushed. If the client disconnects, the
 * loop keeps generating — work is persisted, so a reload picks it up.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[runId]/images">) {
  const { runId } = await ctx.params;
  if (!UUID_RE.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const { db, runs, campaignItems } = await import("@/lib/db");
  const { generateImage } = await import("@/lib/llm/image");

  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const pending = await db
    .select({ id: campaignItems.id, imagePrompt: campaignItems.imagePrompt })
    .from(campaignItems)
    .where(
      and(
        eq(campaignItems.runId, runId),
        isNotNull(campaignItems.imagePrompt),
        isNull(campaignItems.imageUrl),
      ),
    )
    .orderBy(asc(campaignItems.sortOrder));

  const total = pending.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: ImageStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      // Mark closed on abort but do NOT stop generating — images persist, so
      // completed work survives the disconnect.
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      send({ type: "start", total });

      if (total === 0 || inFlight.has(runId)) {
        send({ type: "done", generated: 0, total });
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
        return;
      }

      inFlight.add(runId);
      let generated = 0;
      let cursor = 0;

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
            while (cursor < total) {
              const item = pending[cursor++];
              if (!item.imagePrompt) continue;
              try {
                const image = await generateImage(
                  item.imagePrompt,
                  `runs/${runId}/${item.id}.jpg`,
                );
                // Persist first, then push — a dropped event is recoverable
                // from the DB; a pushed-but-unpersisted image is not.
                await db
                  .update(campaignItems)
                  .set({ imageUrl: image.url, updatedAt: new Date() })
                  .where(eq(campaignItems.id, item.id));
                generated++;
                send({ type: "image", itemId: item.id, url: image.url, done: generated, total });
              } catch (error) {
                console.warn(`[images] generation failed for item ${item.id}:`, error);
                send({ type: "failed", itemId: item.id });
              }
            }
          }),
        );
        send({ type: "done", generated, total });
      } finally {
        inFlight.delete(runId);
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
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
