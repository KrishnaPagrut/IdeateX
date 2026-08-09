/**
 * Server-Sent Events stream for a simulation run.
 *
 * Runs all three strategies concurrently and interleaves their snapshots into
 * one stream, so the UI can animate three races side by side. Each frame is
 * tagged with its strategyId; the client fans them back out.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ai } from "@/lib/ai";
import { getCampaign } from "@/lib/campaign";
import { db, schema } from "@/lib/db";
import { Simulation, seedFor, type SimSnapshot } from "@/lib/sim/engine";
import type { SimulationResult } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKS = 24;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");
  if (!campaignId) return new Response("campaignId required", { status: 400 });

  const campaign = getCampaign(campaignId);
  if (!campaign?.audience || !campaign.strategies) {
    return new Response("campaign not ready", { status: 400 });
  }

  const { audience, strategies } = campaign;
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

      // Abort cleanly if the browser navigates away mid-run.
      req.signal.addEventListener("abort", () => {
        closed = true;
      });

      send("start", {
        strategies: strategies.map((s) => ({ id: s.id, name: s.name, theme: s.theme, accent: s.accent })),
        cohorts: audience.cohorts,
        personas: audience.personas.map((p) => ({
          id: p.id,
          handle: p.handle,
          displayName: p.displayName,
          cohortId: p.cohortId,
          influence: p.influence,
        })),
        edges: audience.edges,
        totalTicks: TICKS,
        provider: ai.name,
      });

      const runIds = new Map<string, string>();
      strategies.forEach((s) => {
        const runId = nanoid(10);
        runIds.set(s.id, runId);
        db.insert(schema.simulationRuns)
          .values({
            id: runId,
            campaignId,
            strategyId: s.id,
            status: "running",
            seed: seedFor(campaignId, s.id),
          })
          .run();
      });

      const finals = new Map<string, SimSnapshot>();

      // Drive the three runs in lockstep so their ticks stay aligned on screen.
      const generators = strategies.map((strategy) => {
        const sim = new Simulation(audience, strategy, {
          seed: seedFor(campaignId, strategy.id),
          ticks: TICKS,
          llmBudget: ai.live ? 8 : 0,
          reaction: ai.live
            ? async ({ persona, cohort, post, strategy: st, stance }) =>
                ai.text(
                  "You write short, realistic social replies in character. One or two sentences, lowercase, no hashtags, no emoji.",
                  `You are @${persona.handle}, part of the "${cohort.name}" group. You are feeling ${stance}.\nYour objections: ${persona.objections.join(", ")}.\nCampaign: ${st.centralMessage}\nPost you are replying to: "${post.body}"`,
                  { task: "reaction", context: { persona }, maxTokens: 90 },
                )
            : undefined,
        });
        return { strategy, sim, iter: sim.run() };
      });

      try {
        for (let tick = 1; tick <= TICKS; tick++) {
          if (closed) break;
          for (const g of generators) {
            const { value, done } = await g.iter.next();
            if (done || !value) continue;
            finals.set(g.strategy.id, value);
            send("tick", {
              strategyId: g.strategy.id,
              tick: value.tick,
              totalTicks: value.totalTicks,
              scores: value.scores,
              cohortState: value.cohortState,
              narratives: value.narratives,
              activatedPersonaIds: value.activatedPersonaIds,
              // Only the newest events and posts, to keep frames small.
              events: value.events.slice(-12),
              posts: value.posts.slice(-6),
            });
          }
          // Yield to the event loop so frames actually flush to the browser
          // instead of arriving as one burst at the end.
          await new Promise((r) => setTimeout(r, 90));
        }

        // Persist results.
        const results: SimulationResult[] = [];
        for (const g of generators) {
          const snap = finals.get(g.strategy.id);
          if (!snap) continue;
          const runId = runIds.get(g.strategy.id)!;
          const events = g.sim.finalEvents();

          const reactions = events
            .filter((e) => e.type === "reply" && e.body)
            .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment))
            .slice(0, 6)
            .map((e) => {
              const p = audience.personas.find((x) => x.id === e.personaId);
              return {
                personaId: e.personaId,
                handle: p?.handle ?? e.personaId,
                cohortId: e.cohortId,
                body: e.body!,
                sentiment: e.sentiment,
              };
            });

          const result: SimulationResult = {
            strategyId: g.strategy.id,
            runId,
            ticks: TICKS,
            scores: snap.scores,
            narratives: snap.narratives,
            cohortBreakdown: snap.cohortState.map((c) => ({
              cohortId: c.cohortId,
              reach: Math.round((c.reached / Math.max(1, c.population)) * 100),
              sentiment: c.sentiment,
              purchaseIntent: c.purchaseIntent,
            })),
            representativeReactions: reactions,
            explanation: `${g.strategy.name} reached ${snap.scores.reach}% with trust ${snap.scores.trust} and intent ${snap.scores.purchaseIntent}.`,
          };
          results.push(result);

          db.update(schema.simulationRuns)
            .set({
              status: "complete",
              ticks: TICKS,
              scores: JSON.stringify(snap.scores),
              narratives: JSON.stringify(snap.narratives),
              result: JSON.stringify(result),
            })
            .where(eq(schema.simulationRuns.id, runId))
            .run();

          // Store events in bulk for the evidence drill-down.
          if (events.length) {
            db.insert(schema.simulationEvents)
              .values(
                events.slice(0, 2000).map((e) => ({
                  id: `${runId}_${e.id}`,
                  runId,
                  tick: e.tick,
                  type: e.type,
                  personaId: e.personaId,
                  cohortId: e.cohortId,
                  targetPostId: e.targetPostId ?? null,
                  body: e.body ?? null,
                  sentiment: Math.round(e.sentiment * 100),
                  llmBacked: e.llmBacked,
                  narrativeId: e.narrativeId ?? null,
                })),
              )
              .run();
          }
        }

        send("complete", { results });
      } catch (err) {
        console.error("[api/simulate] run failed:", err);
        send("error", { message: err instanceof Error ? err.message : "simulation failed" });
      } finally {
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
