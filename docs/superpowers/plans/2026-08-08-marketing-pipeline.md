# Marketing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn IdeateX into a marketing platform: product inputs → one shared synthetic audience → 3 campaign strategies raced in a tick-based social sim → advisor panel auto-picks a winner → deep LLM swarm on the winner → report with drafted campaign content.

**Architecture:** New stages inside the existing engine (orchestrator/agent_runs/SSE unchanged in mechanics). Kaavya's `social-sim.ts` ports to `src/lib/engine/social/`; its types graduate into `src/lib/schemas/`. Persona traits and the follow graph are derived deterministically in code (planners write pool contracts and never see individual personas, so an LLM can't assign per-persona traits without a new fan-out — deviation from spec §2, amended there).

**Tech Stack:** Next.js 16, AI SDK 7 (`generate()` wrapper only), Drizzle, Zod, Vitest, seeded RNG from `launchlab/rng.ts`.

## Global Constraints

- Every LLM call goes through `executeAgent` → `generate()`; model ids only from `MODELS.reasoner|swarm|generator`.
- `docs/contracts.md` updated in the same commit as any surface it pins.
- `MOCK_LLM=1` must run the whole pipeline end-to-end (mock outputs are schema-synthesized; code must tolerate mock ids not matching real ids — deterministic fallbacks required).
- Never run scripts against PGlite while a dev server is up.
- New DB columns require `pnpm db:generate` + committed migration.
- Pipeline statuses: pending → framing → planning → strategizing → racing → advising → simulating → discussing (opt-in) → synthesizing → completed.
- Commit after every task; `pnpm typecheck && pnpm test` green before each commit.

---

### Task 1: Schemas, DB columns, event types, contracts

**Files:**
- Create: `src/lib/schemas/marketing.ts`
- Create: `src/lib/schemas/report.ts`
- Modify: `src/lib/schemas/brief.ts`, `src/lib/schemas/events.ts`, `src/lib/schemas/index.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `docs/contracts.md`, `docs/superpowers/specs/2026-08-08-marketing-pipeline-design.md` (traits-in-code amendment)

**Interfaces (Produces):**
- `MarketingBriefSchema` / `MarketingBrief` — replaces `BriefSchema` usage in framing; has `cohorts` (name, description, populationShare, coreInterests, coreValues, commonObjections, purchasingTriggers, mediaDiet, baseline{humor,skepticism,influence,persuadability}) instead of `segments`.
- `CampaignStrategySchema`, `StrategyScoresSchema`, `PlatformSchema`, `ContentFormatSchema`, `CreativeThemeSchema`, `SimTraitsSchema`, `AudienceEdgeSchema`, `SyntheticAudienceSchema` (persona entries: `{personaId, cohort, traits, engagement}` — library-backed, NOT launchlab's invented handles), `NarrativeSchema`, `RaceResultSchema` (`{strategyId, scores, narratives, cohortState[], reachedCount, personaCount}`).
- `AdvisorVerdictSchema` (`{lens, ranking:[{strategyId, rank, argument}], directives:[{directive, rationale}], concerns[]}`), `AdvisorConsensusSchema` (`{winnerStrategyId, rationale, agreements[], disagreements[], directives[]}`).
- `MarketingReportSchema` (report.ts): verdict/confidence/oneLiner/keyFindings (each `{title, detail, sourceRef}`), `campaign: {xPosts:[{body, answersFinding}] (2-3), redditPost:{title, body, subredditStyle, answersFinding}, adVariants:[{headline, body, answersFinding}] (2)}`, `objectionLedger:[{objection, source, rebuttal}] (max 6)`, `preMortem:{scenario, thread:[{handle, post}] (3-6), responsePlan}`, `nextSteps (max 4)`.
- DB: runs gains `productName: text`, `targetAudience: text`, `objective: text`, `audience: jsonb`, `strategies: jsonb`, `race: jsonb`, `advisorReport: jsonb`. `RUN_STATUSES` gains `"strategizing", "racing", "advising"` (before `"simulating"`). `AGENT_KINDS` gains `"strategy", "reaction", "advisor", "moderator"`.
- Events: `RUN_EVENT_TYPES` gains `"sim:tick"`, `"race:completed"`. `StageEventPayload.stage` enum gains the three new stages. New payloads:

```ts
export const SimTickPayload = z.object({
  strategyId: z.string(),
  strategyName: z.string(),
  tick: z.number(),
  totalTicks: z.number(),
  scores: StrategyScoresSchema,
  reachedCount: z.number(),
  personaCount: z.number(),
  /** Personas newly reached THIS tick (delta), for dot animation. */
  activatedPersonaIds: z.array(z.string()),
  topNarratives: z.array(z.object({
    id: z.string(), label: z.string(),
    sentiment: z.number(), momentum: z.number(),
  })).max(4),
});
export const RaceCompletedPayload = z.object({
  results: z.array(RaceResultSchema),
});
```

**Steps:**

- [ ] Write `marketing.ts` + `report.ts` (shapes above; copy enums/traits from `src/lib/launchlab/types.ts`, adapting persona entries to `{personaId, cohort, traits: {humor, skepticism, influence, persuadability}, engagement: {postRate, replyRate, repostRate, lurkRate}}`).
- [ ] In `brief.ts`, add `MarketingBriefSchema` (keep old `BriefSchema` exported until Task 4 removes its last consumer, then delete it there). Cap cohorts `.min(2).max(8)`.
- [ ] Update `events.ts` and `db/schema.ts` per Interfaces; export new files from `index.ts`.
- [ ] Run `pnpm db:generate` → commit the generated migration; `pnpm db:migrate` locally (dev server stopped).
- [ ] Update `docs/contracts.md` (new run columns, new event types, new agent kinds, new statuses, pipeline order) and amend spec §2: traits + follow graph derived in code.
- [ ] `pnpm typecheck && pnpm test` → commit: `Schemas + DB columns for the marketing pipeline`.

### Task 2: Deterministic traits + follow graph

**Files:**
- Create: `src/lib/engine/social/rng.ts` (move from `launchlab/rng.ts`; update `launchlab/montecarlo.ts` import)
- Create: `src/lib/engine/social/traits.ts`, `src/lib/engine/social/graph.ts`
- Test: `src/lib/engine/social/graph.test.ts`

**Interfaces:**
- Consumes: `Persona` (db), cohort baselines from `MarketingBrief`.
- Produces: `deriveTraits(persona: Persona, baseline: CohortBaseline, seed: number): {traits, engagement}`; `buildFollowGraph(members: Array<{personaId, cohort, influence}>, seed: number): AudienceEdge[]`.

**Steps:**

- [ ] Failing tests first:

```ts
test("deriveTraits is deterministic and baseline-anchored", () => {
  const a = deriveTraits(persona, baseline, 42);
  expect(deriveTraits(persona, baseline, 42)).toEqual(a);
  expect(a.traits.skepticism).toBeGreaterThanOrEqual(0);
  expect(a.traits.skepticism).toBeLessThanOrEqual(1);
});
test("buildFollowGraph: deterministic, no self-follows, cross-cohort ties exist", () => {
  const edges = buildFollowGraph(members, 7);
  expect(buildFollowGraph(members, 7)).toEqual(edges);
  expect(edges.every((e) => e.from !== e.to)).toBe(true);
  expect(edges.some((e) => cohortOf(e.from) !== cohortOf(e.to))).toBe(true);
});
```

- [ ] Implement `deriveTraits`: blend cohort baseline (weight 0.6) with persona psychographics (weight 0.4): skepticism ← inverse openness + priceSensitivity; persuadability ← openness + riskTolerance; humor/influence ← baseline + seeded jitter from `hashSeed(persona.id + seed)`; engagement rates seeded in [0.1, 0.9] with lurkRate anti-correlated to postRate. Clamp all to [0,1].
- [ ] Implement `buildFollowGraph`: per persona, ~4 within-cohort follows (probability ∝ target influence, preferential attachment) + ~1-2 cross-cohort follows; weight = 0.5 + 0.5·targetInfluence.
- [ ] Tests pass → commit: `Deterministic sim traits and follow graph`.

### Task 3: Port the social simulation

**Files:**
- Create: `src/lib/engine/social/sim.ts` (adapted from `src/lib/launchlab/social-sim.ts`; delete `social-sim.ts` + `types.ts` from launchlab, leaving montecarlo/build-graph/rng-shim/README)
- Test: `src/lib/engine/social/sim.test.ts`

**Interfaces:**
- Consumes: `SyntheticAudience` (schemas), `CampaignStrategy`, cohort defs from `MarketingBrief`; `ReactionFn` injected.
- Produces: `class Simulation { constructor(audience, cohorts, strategy, opts{seed, ticks, llmBudget?, reaction?}); async *run(): AsyncGenerator<SimSnapshot>; }` — `SimSnapshot` as in launchlab but persona entries keyed by `personaId`; `seedFor(runId, strategyId)`.

**Steps:**

- [ ] Failing tests (drive the port with the mock-free deterministic path — no `reaction` fn):

```ts
test("same seed replays identically", async () => {
  const run = async () => { const out = []; for await (const s of makeSim(42).run()) out.push(s.scores); return out; };
  expect(await run()).toEqual(await run());
});
test("different themes diverge", async () => {
  const last = async (theme) => { let s; for await (s of makeSim(42, theme).run()); return s.scores; };
  expect(await last("memes")).not.toEqual(await last("educational"));
});
test("reach never exceeds population and is monotonic", ...);
```

- [ ] Port the class: replace `SyntheticPersona` fields with library persona + derived traits (`interests/values/objections` come from the persona's cohort definition); keep affinity/feed/narrative/scoring logic verbatim; `cannedReply` banks stay.
- [ ] Tests pass; `pnpm typecheck` (montecarlo import shim) → commit: `Port social simulation into the engine`.

### Task 4: Marketing framing

**Files:**
- Modify: `src/lib/prompts/framing.ts`, `src/lib/engine/stages/framing.ts`
- Delete `BriefSchema` from `brief.ts` (last consumer switches here); update `src/lib/prompts/planner.ts`, `critique.ts`, `synthesis.ts` type imports as needed to compile (planner switches fully in Task 5; critique/synthesis prompts are retired in Tasks 8/9 — for THIS task change their `Brief` type imports to `MarketingBrief` and their `brief.segments` reads to `brief.cohorts` with `.name`/`.description` only).

**Interfaces:**
- Produces: `runFramingStage(ctx, run): Promise<{brief: MarketingBrief, framingAgentId: string}>` — same shape, new schema. Framing prompt consumes `run.productName`, `run.idea` (description), `run.targetAudience`, `run.objective`, `run.context`; instructs cohort design (2-8 cohorts, populationShare sums ≈ 1, mediaDiet from PlatformSchema).

**Steps:**

- [ ] Rewrite `framingPrompt({productName, description, targetAudience, objective, context, cohortCount})` — system: "You are the head of audience research at a marketing agency…"; demand cohorts with baselines justified by the target audience.
- [ ] Framing stage: pass run fields; schema `MarketingBriefSchema`; still persists to `runs.brief`.
- [ ] `pnpm typecheck && pnpm test` → commit: `Framing produces a marketing brief with audience cohorts`.

### Task 5: Audience build in planning

**Files:**
- Modify: `src/lib/engine/stages/planning.ts`, `src/lib/prompts/planner.ts`

**Interfaces:**
- Consumes: `MarketingBrief.cohorts`, `deriveTraits`, `buildFollowGraph`, `seedFor`.
- Produces: `runPlanningStage(ctx, run, brief, framingAgentId): Promise<{picks, personaById, audience: SyntheticAudience}>` — planners iterate cohorts (planner count = `min(shape.planners, cohorts.length)`, segment name = cohort name); after resolving picks, build audience: `members = picks.map(p => ({personaId, cohort: p.segment, ...deriveTraits(persona, cohortBaseline, seed)}))`, `edges = buildFollowGraph(...)`, seed = `hashSeed(run.id)`; persist to `runs.audience`.

**Steps:**

- [ ] Planner prompt: replace `segment` wording with cohort (name/description/objections/triggers passed in); casting contract mechanics unchanged.
- [ ] Stage: cohort loop + audience assembly + `db.update(runs).set({audience})`.
- [ ] `pnpm typecheck && pnpm test` → commit: `Planning casts the shared synthetic audience`.

### Task 6: Strategy generation stage

**Files:**
- Create: `src/lib/engine/stages/strategy.ts`, `src/lib/prompts/strategy.ts`

**Interfaces:**
- Produces: `runStrategyStage(ctx, run, brief, framingAgentId): Promise<{strategies: CampaignStrategy[]}>` — 3 parallel `executeAgent` calls, kind `"strategy"`, role `"reasoner"`, parent = framingAgentId, labels `Strategist · <direction>`; directions fixed: `["humor-led", "proof-led", "aspiration-led"]`, each prompt pinning allowed themes (humor-led → memes|founder_led; proof-led → educational|direct_response; aspiration-led → aspirational|serious). Force `strategies[i].id = "strategy_" + i` in code after generation (mock ids unreliable). Persist to `runs.strategies`.

**Steps:**

- [ ] Prompt: consumes brief cohorts + product fields; demands `targetCohortIds` ⊆ cohort names (reask once on violation, then clamp in code to all cohorts).
- [ ] Stage + persist → `pnpm typecheck` → commit: `Three-way strategy generation`.

### Task 7: Race stage

**Files:**
- Create: `src/lib/engine/stages/race.ts`
- Test: extend `src/lib/engine/social/sim.test.ts` with score-extraction unit if logic added

**Interfaces:**
- Consumes: `Simulation`, `strategies`, `runs.audience`, `emitRunEvent`.
- Produces: `runRaceStage(ctx, run, brief, audience, strategies, strategyAgentIds): Promise<RaceResult[]>`.

**Steps:**

- [ ] Implement: 3 sims in parallel (`Promise.all`), `ticks: 28`, `llmBudget: 12`, seed `seedFor(run.id, strategy.id)`. ReactionFn = `executeAgent({kind: "reaction", label: \`${personaName} · reaction\`, parentAgentRunId: strategyAgentIds[i], personaId, role: "swarm", schema: z.object({reply: z.string().max(280)}), ...})` returning `output.reply`; ANY error inside ReactionFn falls back to sim's canned replies (the sim already try/catches).
- [ ] Per tick: `emitRunEvent(runId, "sim:tick", payload)` with delta `activatedPersonaIds` (track previous set per sim). After all: build `RaceResult[]`, persist `runs.race`, emit `race:completed`.
- [ ] Abort/cost: check `ctx.signal.aborted || ctx.meter.exceeded` each tick, throw AbortError/cost_cap accordingly.
- [ ] `pnpm typecheck && pnpm test` → commit: `Strategy race over the shared audience`.

### Task 8: Advisor panel + moderator

**Files:**
- Create: `src/lib/engine/stages/advisors.ts`, `src/lib/prompts/advisors.ts`
- Delete: `src/lib/engine/stages/critique.ts`, `src/lib/prompts/critique.ts`, `src/lib/schemas/critique.ts` (and index export)

**Interfaces:**
- Produces: `runAdvisorStage(ctx, run, brief, strategies, race): Promise<{consensus: AdvisorConsensus, verdicts: AdvisorVerdict[]}>`.

**Steps:**

- [ ] Three lenses (`brand strategist`, `growth & performance`, `community & PR risk`), kind `"advisor"`, parent framingAgentId, role `"reasoner"`, effort `"high"`, grounding tools (web/x_search) attached exactly as critique.ts did (`grounded = run.grounding && !isMock()`, omit effort when tools attached). Each prompt gets: strategies (name, theme, thesis, launch post), all `RaceResult`s (scores tables, narratives with sentiment/momentum, cohort states), and up to 8 LLM-backed reply bodies per strategy from race events.
- [ ] Tolerate advisor failure: `Promise.allSettled`; require ≥2 fulfilled else throw `advisor_failures`.
- [ ] Moderator: kind `"moderator"`, reads the verdicts, outputs `AdvisorConsensusSchema`; code-level guard — if `winnerStrategyId` not in strategies (mock mode always), override with argmax of `scores.purchaseIntent + scores.audienceFit − scores.brandSafetyRisk/2` and note `rationale += " (winner resolved by score fallback)"`. Persist `runs.advisorReport = {consensus, verdicts}`.
- [ ] `pnpm typecheck && pnpm test` → commit: `Advisor panel deliberates and picks the winner`.

### Task 9: Rewire orchestrator + deep swarm stimulus + report synthesis + cost

**Files:**
- Modify: `src/lib/engine/orchestrator.ts`, `src/lib/engine/stages/personas.ts` (stimulus only), `src/lib/engine/stages/synthesis.ts`, `src/lib/prompts/synthesis.ts`, `src/lib/prompts/persona.ts` (accept composed stimulus), `src/lib/llm/cost.ts`

**Interfaces:**
- Pipeline order per Global Constraints; `NON_TERMINAL` gains the three new statuses.
- Deep swarm stimulus: `composeStimulus(run, winner) = \`${run.productName}: ${run.idea}\n\nCampaign message under test:\n"${winner.centralMessage}"\n\nLaunch post (${winner.sampleLaunchPost.platform}): ${winner.sampleLaunchPost.body}\`` — passed as `idea` into `personaPrompt` (rename param to `stimulus` where touched).
- Synthesis: `runSynthesisStage(ctx, run, brief, aggregates, consensus, verdicts, race, winner, records, framingAgentId, discussionNote)` → `MarketingReport` persisted to `runs.synthesis`. Prompt feeds: winner + why (consensus), race score comparison, directives (MUST be honored by drafts — every draft's `answersFinding` cites a directive or finding), top negative narratives (→ objectionLedger), detractor reply bodies (→ preMortem thread grounding), quotes via existing `selectQuotes`.
- `estimateRunCost` adds: `3 × reasoner(6k/2.5k)` strategies + `36 × swarm(1.5k/300)` reactions + `4 × reasoner(14k/3k)` advisors+moderator; drops the old 2-critique line.

**Steps:**

- [ ] Orchestrator: framing → planning → `setStatus("strategizing")`/stage events → `setStatus("racing")` → `setStatus("advising")` → simulating (swarm on winner) → discussing (unchanged, opt-in) → synthesizing (new signature) → completed. Checkpoint between every stage.
- [ ] `MOCK_LLM=1 pnpm smoke-run` (dev server stopped) passes end-to-end.
- [ ] `pnpm typecheck && pnpm test` → commit: `Marketing pipeline wired end-to-end`.

### Task 10: API + run form

**Files:**
- Modify: `src/app/api/runs/route.ts`, `src/components/run-form/new-run-form.tsx`, `src/app/runs/runs-table.tsx`, `src/app/page.tsx` (copy), `docs/contracts.md`

**Steps:**

- [ ] `CreateRunSchema`: `{productName: string().trim().min(2).max(120), description: min(20) → runs.idea, targetAudience: trim().min(10).max(2000), objective: trim().max(2000).optional(), tier, grounding, discussion, personaBudget}`. Insert maps productName/targetAudience/objective columns.
- [ ] Form: four inputs (product name Input; description Textarea with the existing min-length affordance; target audience Textarea; objective Textarea optional behind the existing "Add context"-style toggle, keep context toggle too). Body sends new fields.
- [ ] Runs table lists `productName` (fallback: idea slice). Update contracts.md API section in same commit.
- [ ] `pnpm typecheck` → commit: `Marketing run inputs`.

### Task 11: Live run UI — race panel

**Files:**
- Modify: `src/components/run-live/adapt.ts`, `src/components/run-live/types.ts`, `src/components/run-live/stage-progress.tsx`, `src/app/runs/[runId]/run-shell.tsx`
- Create: `src/components/run-live/race-panel.tsx`

**Steps:**

- [ ] Reducer: handle `sim:tick` (accumulate per-strategy `{latestTick, scores, reachedCount, personaCount, activatedPersonaIds: Set, topNarratives}`) and `race:completed`; extend UI state type. Stage progress shows the three new stages (labels: Strategy, Race, Advisors).
- [ ] `race-panel.tsx`: one column per strategy — name/theme, tick progress bar, dot grid (one dot per audience persona, grouped by cohort, lit when activated; color by latest scores sentiment proxy), score bars for the 8 scores, narrative chips with momentum. Pure CSS/SVG dots; no React Flow. Rendered by run-shell during `racing`/`advising` and kept (collapsed) after.
- [ ] `pnpm typecheck` + visual check via `pnpm dev` on a `MOCK_LLM=1` run → commit: `Live race panel`.

### Task 12: Results UI — report extensions

**Files:**
- Create: `src/components/results/race-comparison.tsx`, `src/components/results/advisor-panel.tsx`, `src/components/results/campaign-package.tsx`
- Modify: `src/components/results/results-view.tsx`, `src/components/results/verdict-card.tsx` (winner framing), delete `critique-panel.tsx`, update `src/components/results/results-report.test.ts`

**Steps:**

- [ ] `race-comparison`: 8-score table across strategies with winner column highlighted; per-strategy narrative lists.
- [ ] `advisor-panel`: card per advisor verdict (lens, ranking, key argument), consensus block (agreements/disagreements/directives).
- [ ] `campaign-package`: drafts (X posts, Reddit post, ad variants) each with a copy button and its `answersFinding` annotation; objection ledger table; pre-mortem thread rendered as fake posts + response plan.
- [ ] Wire into `results-view` section order: verdict → race → advisors → aggregates/quotes/focus-group (existing) → campaign package → next steps. Update report tests.
- [ ] `pnpm typecheck && pnpm test` → commit: `Results report: race, advisors, campaign package`.

### Task 13: Fixture, smoke, docs

**Files:**
- Modify: `scripts/smoke-run.ts` (assert new stages/columns), `src/fixtures/run-fixture.json` (regenerated), `src/app/dev/fixture/page.tsx` (only if compile breaks), `CLAUDE.md` + `README.md` pipeline descriptions, `docs/contracts.md` fixture section

**Steps:**

- [ ] `MOCK_LLM=1 pnpm smoke-run -- --mock --fixture` regenerates the fixture (dev server stopped); `/dev/fixture` renders the new report sections.
- [ ] Update CLAUDE.md "What this is" + README to the new pipeline sentence; contracts.md fixture note.
- [ ] Full gate: `pnpm typecheck && pnpm test && pnpm build` → commit: `Fixture + docs for the marketing pipeline`.

---

## Self-review notes

- Spec coverage: §1→T4/T10, §2→T2/T5, §3→T6, §4→T3/T7, §5→T8, §6→T9, §7→T9/T12, §8→T9 (cost) + tests in T2/T3, fixture→T13. Spec §2 amended (traits in code) in T1.
- Type consistency: `MarketingBrief.cohorts[].name` is the segment key everywhere (picks.segment, audience.members[].cohort, cohortState.cohortId).
- Mock-mode fallbacks: strategy ids forced in code (T6), moderator winner score-fallback (T8), reaction failures → canned replies (T7).
