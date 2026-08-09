# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

IdeateX is a marketing platform that races campaign strategies on a synthetic population before launch. A run flows framing (audience cohorts) → K planners (cast personas from the library into one shared audience + follow graph) → 3 strategists → social-sim race (seeded tick engine, ~12 LLM "reaction" calls per strategy) → advisor panel (3 lenses + moderator pick the winner, optional web/x_search grounding) → deep persona swarm on the winner → report synthesis (drafted content, objection ledger, PR pre-mortem). Next.js 16 (App Router) + AI SDK 7 (`@ai-sdk/xai`) + Drizzle. Development happens on `idhant/mvp`; do not merge to `main` without asking.

## Commands

pnpm is the package manager. Scripts that touch the DB or LLM load `.env` via `dotenv -e .env`.

- `pnpm dev` — dev server (Next 16 allows only one per directory)
- `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm test` — Vitest; single file: `pnpm vitest run src/lib/engine/aggregate.test.ts`
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm verify-models` — checks model IDs in `src/lib/llm/models.ts` against the live xAI API; run after touching that file
- `pnpm seed-personas` — seeds ~120 personas (warns if ≥100 already active)
- `pnpm smoke-run` — end-to-end run; `--mock --fixture` regenerates `src/fixtures/run-fixture.json`

Key env: `MOCK_LLM=1` routes all LLM calls to a schema-synthesizing mock (no `.env` needed). `DATABASE_URL` selects Supabase; when unset, the DB falls back to PGlite persisted at `./.pglite`. A real Quick-tier run costs ≈ $0.13.

## Hard rules

- **`docs/contracts.md` pins the interfaces between modules** (engine, API routes, fixtures, personas). Changing any surface it describes is a cross-module change: update that doc in the same commit.
- **Model IDs live only in `src/lib/llm/models.ts`** (`MODELS.reasoner|swarm|generator`). Never hardcode a model ID elsewhere.
- **Every LLM call goes through `generate()` in `src/lib/llm/client.ts`** — it handles mock routing and structured output. Retries are the caller's job.
- **PGlite is single-process.** Never run `seed-personas` or `smoke-run` while a dev server is up when using the PGlite fallback — you get stale reads or corruption.
- **AI SDK 7 API surface:** structured output is `generateText` + `Output.object({schema})` (there is no `generateObject`); the parsed result is in `.output`, token usage in `.usage.inputTokens/.outputTokens`.

## Architecture

- `src/lib/engine/` — orchestrator (`startRun`/`cancelRun`, fire-and-forget), per-stage logic in `stages/`, event bus in `events.ts`. Every LLM call gets an `agent_runs` row plus paired `agent:*` events; the swarm graph is derived from `parent_agent_run_id`. Persona fan-out uses `p-limit(20)` with 2 retries on 429/5xx; a run aborts if >20% of personas fail or the `CostMeter` is exceeded. Any non-terminal run is marked `stale` on first import.
- `src/lib/schemas/` — Zod schemas for every structured output and the SSE event union (`RunEventSchema`). These types are the contract between engine, API, and UI.
- `src/lib/db/schema.ts` — Drizzle tables `personas`, `runs`, `agent_runs`, `run_events`.
- `src/app/api/runs/` — REST + SSE. `POST /api/runs` creates the row, calls `startRun`, returns `{runId}` immediately; `GET /api/runs/[runId]/events` replays via `Last-Event-ID` (= event seq) then live-follows. The live run page composes snapshot fetch (`GET /api/runs/[runId]`) + an SSE reducer.
- `src/components/` — grouped by feature (`run-live`, `results`, `run-form`, `personas`); `ui/` is shadcn on Base UI.
- `/dev/fixture` — UI harness that replays `src/fixtures/run-fixture.json` (the exact `GET /api/runs/[runId]` snapshot shape) without a live backend.
