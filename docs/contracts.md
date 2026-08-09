# IdeateX — interface contracts between workstreams

These are the shared surfaces. Changing anything here is a cross-workstream
change: update this doc in the same commit and flag it at merge time.

## Modules already landed (Phase 0 — code against, don't reimplement)

- `src/lib/db/schema.ts` — Drizzle tables `personas`, `runs`, `agent_runs`,
  `run_events` + TS unions (`RunTier`, `RunStatus`, `AgentKind`, `AgentStatus`).
- `src/lib/db/index.ts` — `db` client. Uses Supabase (`DATABASE_URL`) when set,
  otherwise falls back to PGlite persisted at `./.pglite` with migrations
  auto-applied — so every workstream can run against a real Postgres with zero
  setup (no `.env` needed for mock-mode work).
- `src/lib/llm/client.ts` — `generate<T>({role, schema, system, prompt, effort?, tools?, abortSignal?})`
  → `{object, rawText, inputTokens, outputTokens, model}`. The ONLY way to call the LLM.
  `MOCK_LLM=1` routes to the mock adapter automatically. Retries are the caller's job.
- `src/lib/llm/models.ts` — model registry (`MODELS.reasoner|swarm|generator`). Never
  hardcode a model id anywhere else.
- `src/lib/llm/cost.ts` — `estimateRunCost(tier, grounding)`, `CostMeter`, `TIER_SHAPE`
  (planner/persona counts per tier).
- `src/lib/schemas/*` — zod schemas for every structured output:
  `MarketingBriefSchema` (cohort-based brief), `CastingPlanSchema`,
  `VerdictSchema`, `CampaignStrategySchema`, `SyntheticAudienceSchema`,
  `RaceResultSchema`, `AdvisorVerdictSchema`/`AdvisorConsensusSchema`,
  `MarketingReportSchema`, `GeneratedPersonaBatchSchema`, and the SSE event
  union `RunEventSchema` (now including `sim:tick` + `race:completed`).
- `src/lib/engine/events.ts` — `emitRunEvent`, `subscribeToRun`, `replayRunEvents`,
  `initRunSequence`. Events persist to `run_events` AND fan out in-process.

## Engine contract (workstream A provides)

```ts
// src/lib/engine/orchestrator.ts
export function startRun(runId: string): void; // fire-and-forget; never throws synchronously
export function cancelRun(runId: string): boolean; // true if the run was live in this process
```

- `startRun` drives statuses (marketing pipeline): pending → framing →
  planning → strategizing → racing → advising → simulating → discussing
  (opt-in) → synthesizing → completed (or failed/cancelled).
- Marketing-run artifacts persist on the runs row in stage order:
  `brief` (MarketingBrief), `audience` (SyntheticAudience), `strategies`
  (CampaignStrategy[3]), `race` (RaceResult[3]), `advisorReport`
  ({consensus, verdicts}), `synthesis` (MarketingReport), `aggregates`.
  Input columns: `productName`, `idea` (= product description),
  `targetAudience`, `objective`, `context`.
- Every LLM call gets an `agent_runs` row (pending→running→completed/failed) and
  paired `agent:*` events. Graph edges come from `parent_agent_run_id`:
  framing has no parent; planners → framing; strategies → framing;
  race reactions → their strategy; advisors + moderator → framing;
  personas → their planner; synthesis → framing.
- The race additionally emits `sim:tick` (per strategy per tick: scores,
  reached delta, top narratives) and one final `race:completed` event.
- Persona fan-out: `p-limit(20)`, 2 retries with backoff on 429/5xx, run aborts
  if >20% of personas fail or `CostMeter.exceeded`.
- In mock mode, planner casting picks are replaced with a real sample of persona
  ids from the DB (mock output can't know real uuids).
- Boot-time stale marking: any non-terminal run is set to `stale` on first import.

## API contract (workstream B provides)

- `POST /api/runs` body `{productName: string, description: string,
  targetAudience: string, objective?: string, context?: string, tier: RunTier,
  grounding: boolean, discussion?: boolean, personaBudget?: number|null}`
  → `201 {runId}`. `description` is stored as `runs.idea`. Creates the row,
  calls `startRun(runId)`, returns immediately.
- `GET /api/runs` → `{runs: Run[]}` newest first.
- `GET /api/runs/[runId]` → `{run, agents: AgentRun[], personas: Record<personaId, PersonaLite>}`
  — full snapshot for initial page load / completed runs.
- `GET /api/runs/[runId]/events` → SSE. Uses `Last-Event-ID` (= seq) to replay via
  `replayRunEvents`, then live-follows `subscribeToRun`. Event `id` = seq,
  `data` = JSON `RunEventMessage`. 15s heartbeat comments.
- `POST /api/runs/[runId]/cancel` → `{cancelled: boolean}`.
- `POST /api/runs/estimate` body `{tier, grounding}` → `{usd: number}`.
- `GET/POST /api/personas` (list filters include `domain` + `subdomain`),
  `GET/POST /api/personas/pools`, `GET/PATCH /api/personas/[id]`,
  `POST /api/personas/generate` body `{count?, pool?}` (see workstream D).

## Fixture contract (workstream C consumes)

- `src/fixtures/run-fixture.json`: `{run, agents, personas}` in exactly the
  `GET /api/runs/[runId]` snapshot shape, from a completed mock Standard
  marketing run WITH a discussion stage (the run row carries brief/audience/
  strategies/race/advisorReport/synthesis). Regenerate with
  `MOCK_LLM=1 npx tsx scripts/smoke-run.ts --mock --fixture --discussion`.
- The live page composes: snapshot fetch → SSE reducer over `RunEventMessage`.
  UI state shape is workstream C's choice; input types are fixed by
  `src/lib/schemas/events.ts`.

## Persona contract (workstream D provides)

- The library is pooled: `src/lib/personas/taxonomy.ts` defines domains →
  subdomains, and every persona carries `domain` + `subdomain` columns
  (default `general`/`general` for pre-taxonomy personas).
- `scripts/seed-personas.ts`: seeds pool-by-pool from the taxonomy via
  `generate({role: "generator", schema: GeneratedPersonaBatchSchema,
  temperature: 0.9, ...})`, inserting with the pool's `domain`/`subdomain`,
  `source: 'seed'`, `avatarSeed = nanoid()`. `--per-pool N` (default 12; ~25
  is the full pool target), `--pool domain/subdomain` for one pool, `--append`
  to grow past the target, `--seed N` for reproducible casting sheets.
  Idempotent-ish: pools already at/above target are skipped and a per-pool
  count report is printed.
- **Casting sheets** (`src/lib/personas/casting-sheet.ts`): every generation
  batch (seeder and `/api/personas/generate`) draws a randomized per-batch
  constraint sheet — gender quota (women 40-55% / men 40-55% / nonbinary 3-8%,
  redrawn per batch), age curve (skew-young/skew-old/bimodal/flat), income
  spread, two must-appear household structures, geography mix, and a pair of
  wildcard constraints from a 36-entry bank. `buildCastingSheet(seed?)` is
  deterministic given a seed (random otherwise); the seeder derives per-batch
  seeds via `deriveSeed(baseSeed, poolLabel, batchIndex)` and logs each
  batch's `sheetSummary` one-liner. The sheet is rendered into the batch
  prompt as hard requirements by `buildPersonaBatchPrompt({sheet, ...})`.
- **Custom pools**: users create pools from a free-text prompt. The
  `custom_pools` table (`src/lib/db/schema.ts`) stores each definition —
  `domain` (always `"custom"`), `subdomain` (kebab slug, unique per domain),
  `name`, `description`, `seedHints`, and the original `prompt`. Pool keys
  resolve through `resolvePoolTarget` in `src/lib/personas/custom-pools.ts`
  (static taxonomy first, then `custom_pools`), so `custom/<slug>` works
  anywhere a taxonomy key does: generation, the pool catalog, and planner
  casting (the planning stage feeds custom names/descriptions into
  `buildCatalog`).
- `GET /api/personas/pools` → `{pools: [{domain, subdomain, name, description,
  count, sample}]}` — every taxonomy pool (count may be 0), every custom pool,
  plus non-taxonomy pools found in the DB (e.g. general/general). `sample` is
  up to 5 `{id, name, avatarSeed}` for avatar stacks.
- `POST /api/personas/pools` body `{prompt: string}` → `201 {pool}` — one
  `generate({role: "generator", schema: PoolSpecSchema})` call distills the
  prompt into `{name, description, seedHints}`, slugged (deduped `-2`, `-3`…)
  and inserted under the `custom` domain. Members are generated separately via
  `POST /api/personas/generate` with the returned key; a seeding failure still
  leaves a usable empty pool. Prompts under 8 chars 400; LLM failure 502 with
  nothing inserted.
- `POST /api/personas/generate` body `{count?, pool?: "domain/subdomain"}` —
  with `pool` (taxonomy or custom), personas are written to fit that pool and
  stamped into it; unknown pools 400.
## Launch kit (post-run tooling)

After a run completes, the user expands the WINNING strategy into a dated
campaign timeline with platform-native copy and image prompts, then images
stream in asynchronously. Shapes live in `src/lib/schemas/launch.ts`
(`GeneratedTimelineSchema`, `CampaignItemSnapshot`, `ImageStreamEventSchema`);
rows in `campaign_items` (`src/lib/db/schema.ts`).

- `POST /api/runs/[runId]/launch-kit` → `201 {items: CampaignItemSnapshot[]}`.
  Guards: run exists (404), status `completed` and brief/strategies/
  advisorReport/synthesis present (409), no existing items — a second POST is
  an idempotent read: `409 {error, items}`. Winner = strategy matching
  `advisorReport.consensus.winnerStrategyId` (falls back to `strategies[0]`
  when the id doesn't resolve, e.g. synthetic mock ids). ONE
  `generate({role: "reasoner", effort: "medium", schema:
  GeneratedTimelineSchema})` call with the advisory directives + verdict
  concerns + report risks as hard constraints (`src/lib/prompts/timeline.ts`).
  The call is made directly via `generate()` — deliberately NOT through
  `executeAgent`, and no `agent_runs` row is created: the launch kit is
  post-run tooling, not a pipeline stage, so it must not appear in the run's
  agent graph. Items are ordered by `dayOffset` with `sortOrder = index`; if
  the model produced no dayOffset-0 item, the item closest to 0 is snapped to
  0 so every kit has a launch-day anchor.
- `GET /api/runs/[runId]/launch-kit` → `{items}` (may be empty), ordered by
  `sortOrder`.
- `GET /api/runs/[runId]/images` → SSE of `ImageStreamEvent` (plain `data:`
  lines, JSON discriminated on `type`: start/image/failed/done). Pending =
  this run's items with `imagePrompt` NOT null AND `imageUrl` null, in
  `sortOrder`. 3-way concurrency over a shared cursor; each image is generated
  via `generateImage(prompt, "runs/<runId>/<itemId>.jpg")` (stable path —
  regeneration overwrites in place), persisted to the row FIRST, then pushed.
  A module-level in-flight set keyed by runId makes reconnects no-ops
  (start + done immediately) instead of duplicate work; client aborts do NOT
  stop generation — completed work is persisted for the next load. Nothing
  pending → `start{total:0}` + `done` immediately. 15s heartbeat comments,
  `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
- `PATCH /api/items/[itemId]` body: either `{action: "regenerate_image"}`
  (nulls `imageUrl` so the image stream regenerates exactly that item; 400 if
  the item has no `imagePrompt`) or a strict partial of `{title, body,
  callToAction, hashtags, state, dayOffset, imagePrompt}` — clearing or
  changing `imagePrompt` also nulls `imageUrl`. Sets `updatedAt`. →
  `{item: CampaignItemSnapshot}`.
- `DELETE /api/items/[itemId]` → soft delete: `state: "cut"`, → `{item}`.

- Planners never see individual personas at library scale. The engine
  (workstream A) builds a `PoolCatalogEntry[]` catalog from the live library —
  `{key, name, description, available, labels}` per pool, labels being the
  pool's most frequent persona tags — and planners write casting contracts
  against it (`formatPoolCatalog` in `src/lib/prompts/planner.ts`). The engine
  resolves contracts to concrete personas within the run's persona budget,
  softly matching `mustInclude` labels against persona `tags`/`archetype` — so
  tags are casting labels: 4-6 **lowercase-kebab-case** descriptors per
  persona (kebab-case is load-bearing: planners' `mustInclude` matching
  depends on it). The label vocabulary (`LABEL_VOCABULARY` in
  `src/lib/prompts/persona-gen.ts`, rendered into the generation system
  prompt) is organized by axis — **attitude, price posture, decision style,
  life stage, tech posture, context, values** — and each persona draws labels
  from at least three axes; the generator may also coin new kebab-case labels
  when the vocabulary falls short.
