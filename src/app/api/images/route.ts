/**
 * Streams generated images as they complete.
 *
 * Image generation is the slowest thing in the pipeline, so nothing blocks on
 * it. Pages render immediately with placeholder tiles and open this stream;
 * each finished image is persisted and pushed to the client, which swaps it in.
 * Watching assets materialise one by one reads as progress rather than as lag.
 */
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ai } from "@/lib/ai";
import { hashSeed } from "@/lib/ai/rng";
import { getCampaign } from "@/lib/campaign";
import { db, schema } from "@/lib/db";
import type { CampaignStrategy } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many images to generate at once. Enough to be fast, few enough to avoid rate limits. */
const CONCURRENCY = 3;

/**
 * Campaigns currently generating. Prevents a second tab (or a reconnect) from
 * kicking off duplicate work for the same images.
 */
const inFlight = new Set<string>();

type Job =
  | { kind: "strategy"; id: string; prompt: string }
  | { kind: "item"; id: string; prompt: string };

function pendingJobs(campaignId: string): Job[] {
  const campaign = getCampaign(campaignId);
  if (!campaign) return [];

  const jobs: Job[] = [];

  (campaign.strategies ?? []).forEach((s) => {
    if (!s.representativeImage.url && s.representativeImage.prompt) {
      jobs.push({ kind: "strategy", id: s.id, prompt: s.representativeImage.prompt });
    }
  });

  db.select()
    .from(schema.campaignItems)
    .where(
      and(eq(schema.campaignItems.campaignId, campaignId), isNull(schema.campaignItems.imageUrl)),
    )
    .all()
    .forEach((row) => {
      if (row.imagePrompt) jobs.push({ kind: "item", id: row.id, prompt: row.imagePrompt });
    });

  return jobs;
}

function persist(campaignId: string, job: Job, url: string) {
  if (job.kind === "item") {
    db.update(schema.campaignItems)
      .set({ imageUrl: url })
      .where(eq(schema.campaignItems.id, job.id))
      .run();
  } else {
    // Strategies live inside the campaign's JSON blob, so read-modify-write.
    const campaign = getCampaign(campaignId);
    if (!campaign?.strategies) return;
    const next: CampaignStrategy[] = campaign.strategies.map((s) =>
      s.id === job.id ? { ...s, representativeImage: { ...s.representativeImage, url } } : s,
    );
    db.update(schema.campaigns)
      .set({ strategies: JSON.stringify(next) })
      .where(eq(schema.campaigns.id, campaignId))
      .run();
  }

  db.insert(schema.artifacts)
    .values({
      id: nanoid(12),
      campaignId,
      itemId: job.kind === "item" ? job.id : null,
      kind: "image",
      prompt: job.prompt,
      url: url.startsWith("data:") ? null : url,
      inlineData: url.startsWith("data:") ? url : null,
      provider: ai.live ? "grok_imagine" : "mock",
    })
    .run();
}

export async function GET(req: Request) {
  const campaignId = new URL(req.url).searchParams.get("campaignId");
  if (!campaignId) return new Response("campaignId required", { status: 400 });

  const jobs = pendingJobs(campaignId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      send("start", { total: jobs.length });

      if (!jobs.length || inFlight.has(campaignId)) {
        send("done", { generated: 0, reason: jobs.length ? "already generating" : "nothing pending" });
        controller.close();
        return;
      }

      inFlight.add(campaignId);
      let generated = 0;

      try {
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
            while (cursor < jobs.length) {
              const job = jobs[cursor++];
              // Keep generating even if the client left — the images are
              // persisted, so a reload picks up completed work.
              try {
                const [img] = await ai.image(job.prompt, {
                  seed: hashSeed(`${campaignId}:${job.id}`),
                  n: 1,
                });
                if (!img?.url) continue;
                persist(campaignId, job, img.url);
                generated++;
                send("image", { kind: job.kind, id: job.id, url: img.url, done: generated, total: jobs.length });
              } catch (err) {
                console.warn("[api/images] generation failed for", job.id, err);
                send("failed", { kind: job.kind, id: job.id });
              }
            }
          }),
        );
        send("done", { generated, total: jobs.length });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "image stream failed" });
      } finally {
        inFlight.delete(campaignId);
        if (!closed) controller.close();
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
