# Marketing pipeline: strategy race + advisor panel + campaign package

Date: 2026-08-08
Status: approved
Branch: `idhant/mvp` (Kaavya's `launchlab/` algorithms merged in at `cf16988`)

## Summary

IdeateX pivots from a general stress-testing tool to a marketing platform. A
run takes a product, races K candidate campaign strategies against one shared
synthetic audience in a cheap tick-based social simulation, has an advisor
panel pick a winner automatically, deep-tests the winner with the existing LLM
persona swarm, and produces a report with copy-paste-ready campaign content.

Pipeline: framing → audience build → K strategies → sim race → advisor panel
→ deep swarm on winner → synthesis/report.

Decisions locked with the user:

- A "scenario" is a candidate strategy; all strategies race against ONE shared
  audience (comparable scores, personas generated once).
- Both simulators, layered: Kaavya's tick-based social-sim races all
  strategies; the existing LLM swarm runs once, on the winner only.
- Advisors deliberate AND advise: panel of expert lenses reads all results,
  argues, a moderator synthesizes the winner + directives. Fully automatic —
  no mid-run user gate.
- Deliverable: report + drafted content (X posts, Reddit post, ad variants),
  each draft annotated with the sim finding it answers.
- This REPLACES the existing stress-test flow (single run type).

## 1. Inputs and framing

Run form fields: product name, product description, target audience (free
text), open-ended objective. `BriefSchema` becomes `MarketingBriefSchema`:
product summary, restated objective, key assumptions, risk dimensions, and
audience cohorts in the `AudienceCohort` shape (name, description, population
share, interests, values, objections, purchasing triggers, media diet, trait
baselines) replacing `segments`. One framing call, `MODELS.reasoner`.
Contract change: `docs/contracts.md`, fixture, and run form move in the same
commit.

## 2. Audience build

Personas are cast from the existing pooled library (reusing casting
contracts) into the brief's cohorts — never generated from scratch. The
caster's LLM call also assigns each persona a sim trait vector (humor,
skepticism, influence, persuadability, engagement rates) varying around the
cohort baseline. The follow graph is generated in code, seeded: preferential
attachment, dense within cohorts, sparse cross-cohort weak ties,
influence-weighted. The resulting `SyntheticAudience` is persisted on the run;
race and report read the same frozen population.

## 3. Strategy generation

K=3 `CampaignStrategy` generations, one call each, distinct creative themes
enforced by prompt, targeting cohorts from the brief. `CampaignStrategy` and
audience types graduate from `src/lib/launchlab/types.ts` into
`src/lib/schemas/`.

## 4. Sim race

`Simulation` (from `src/lib/launchlab/social-sim.ts`) ports into
`src/lib/engine/stages/`. Three parallel runs, same audience, seed =
`hash(runId:strategyId)`. Per-tick snapshots stream as new `RunEventSchema`
members (`sim:tick`, `sim:narrative`, …) so the live page animates reach
through the follow graph. The injected `ReactionFn` routes through
`generate()` with `MODELS.swarm`, gets `agent_runs` rows, counts against the
`CostMeter`; ~12 LLM calls per strategy, canned-reply fallback on failure.
Output per strategy: 8 comparative scores, surviving narratives, cohort
states, event log.

## 5. Advisor panel (replaces critics)

Three lenses — brand strategist, growth/performance, community & PR risk —
each one call reading ALL strategies' scores, narratives, pivotal quotes;
each returns a ranked verdict, arguments, and directives. A moderator call
synthesizes consensus winner + consolidated directives. Optional web/x_search
grounding survives in advisor prompts. If an advisor fails after retries, the
moderator proceeds with survivors (minimum two, else the run errors).

## 6. Deep swarm on the winner

Existing persona swarm + discussion stages run once, mechanically unchanged,
with the winner's launch post + central message as stimulus.

## 7. Report and campaign package

Synthesis and report UI extend with: race comparison (score table, narrative
divergence), advisor deliberation (arguments, disagreements, consensus), and
the campaign package — 2–3 X post drafts, a Reddit post, ad copy variants,
each annotated with the finding/directive it answers. Includes the objection
ledger (top negative narratives → FAQ/rebuttal entries) and the PR pre-mortem
(worst plausibly-viral thread grounded in actual detractor events, plus a
prepared response). Fixture regenerated; `/dev/fixture` keeps working.

## 8. Cost, errors, testing

Cost ≈ one deep run + ~36 pivotal calls + 3 strategy calls + 4 advisor calls.
Determinism: identical audience + seed replays identically. Tests: follow
graph properties, sim determinism, score computation units; `MOCK_LLM=1`
end-to-end smoke; fixture regen.

## Out of scope (v1)

`montecarlo.ts` / `build-graph.ts` (unused, left in place), counterfactual
re-runs, A/B copy racing, platform integrations/publishing, mid-run user
decision gates.
