# LaunchLab

**LaunchLab researches your audience, tests campaign strategies in synthetic social worlds, and turns the winning strategy into a complete, editable campaign timeline that you control.**

Describe a product and a campaign objective. LaunchLab researches the category, builds a synthetic audience of fictional archetypes, generates three distinct campaign strategies, races them against the same population in a live social simulation, extracts what worked and what failed, and expands the winner into a dated, editable execution plan.

---

## Quick start

```bash
npm install
npm run db:push     # creates launchlab.db
npm run dev
```

Open http://localhost:3000 and click **Use example**.

No API key is required. Without one, LaunchLab runs on a seeded deterministic
provider — every screen works, and the same brief always produces the same
campaign. Add a key for live generation:

```bash
cp .env.example .env
# XAI_API_KEY=xai-...
```

The badge in the top right always shows which path produced what you're
looking at (`live · grok` or `offline · seeded`).

## The pipeline

```
brief → research → synthetic audience → 3 strategies
                                             ↓
                                   simulation (×3, same audience)
                                             ↓
                                          findings
                                             ↓
                                   campaign timeline
```

**Findings are the connective tissue.** Each one is a traceable lesson from the
simulation with a `directive` attached, and those directives are passed into
timeline generation as hard constraints. That's what makes the generated
campaign a consequence of the simulation rather than an unrelated second
feature — every item's "purpose" field points back at the finding that produced
it.

## The simulation

A seeded, tick-based engine. Routine engagement resolves through cheap
deterministic logic; only *pivotal* moments — a high-influence persona forming a
strong opinion — escalate to Grok. That split keeps a run fast enough to watch,
cheap enough to run three times in parallel, and reproducible enough to
rehearse.

Per tick, each persona gets an algorithmically ranked feed, resolves one action
against it, and propagates reactions along the follow graph. Repeated language
crystallises into named narratives that gain and lose momentum.

Personas only see posts from accounts they follow, plus brand posts injected at
a rate that decays as the launch ages. Reach therefore has to travel the social
graph — which is what makes the network visualisation meaningful and stops
every strategy from trivially saturating the audience.

### Comparative synthetic scores

Eight axes: reach, trust, message comprehension, purchase intent, share
propensity, controversy, audience fit, brand-safety risk.

These rank strategies **against each other under identical starting
conditions**. They are not forecasts of real-world campaign performance, and the
UI says so wherever they appear.

## Synthetic audience

Cohorts and personas are **fictional archetypes** derived from aggregate
behavioural patterns. They are never modelled on identifiable individuals, and
handles are invented.

Each persona carries interests, values, objections, purchasing triggers, humor,
skepticism, influence, persuadability, preferred formats, and engagement rates.
Cohorts set baselines; personas vary around them.

## Architecture

| Layer | Choice |
|---|---|
| App | Next.js 14 (App Router), TypeScript, Tailwind |
| Data | SQLite + Drizzle |
| Model I/O | Zod schemas validate every structured output at the boundary |
| Streaming | Server-Sent Events |
| Visuals | Cytoscape.js (audience graph), dnd-kit (timeline) |
| LLM | xAI Grok + Grok Imagine, with a deterministic offline fallback |

`src/lib/schemas.ts` is the source of truth for every shape. `src/lib/ai/`
holds the provider interface and its two implementations — the app only ever
talks to the interface, so it behaves identically with or without a key.

Live mode **degrades to the mock on any failure** rather than throwing. A demo
that survives bad conference wifi beats one that shows a stack trace.

## Verification

```bash
npx tsx scripts/smoke-ai.ts    # generation chain + determinism
npx tsx scripts/smoke-sim.ts   # three strategies diverge, replay is identical
npm run build
```

## Deliberately out of scope

Nothing publishes or schedules externally. There is no real connector, no OAuth,
and no outbound posting — items stay local. Form definitions are generated and
previewed but no external form is created. These are stubs with the adapter
shape in place, not working integrations.
