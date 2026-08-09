# Custom persona pools from a prompt

**Date:** 2026-08-08 · **Branch:** `idhant/persona-prompt-pools` (worktree off `idhant/mvp`)

## Goal

Let a user describe a population in free text ("risk-averse high-income households
nearing retirement") and get a first-class pool in the persona library: named,
described, seeded with generated personas, growable later, and castable by run
planners exactly like taxonomy pools.

## What exists

- Static taxonomy (`src/lib/personas/taxonomy.ts`) defines 40 `domain/subdomain`
  pools; personas carry `domain`/`subdomain` columns.
- `POST /api/personas/generate` generates into a taxonomy pool (casting sheets,
  anti-clone rules, exclusion lists); unknown pool keys 400.
- `GET /api/personas/pools` merges taxonomy pools with stray DB pools.
- The planner catalog (`buildCatalog` in `src/lib/engine/stages/planning.ts`) is
  built from personas actually in the DB, so any populated pool is castable —
  but non-taxonomy pools fall back to a raw key for name/description.

## Design

1. **`custom_pools` table** (`src/lib/db/schema.ts` + migration): `id`,
   `domain` (always `"custom"`), `subdomain` (kebab slug, unique with domain),
   `name`, `description`, `seedHints`, `prompt` (the user's original text),
   `createdAt`. Persisting the definition is what makes later top-ups
   re-target the same intent and gives planners/UI real descriptions.
2. **Pool resolution** (`src/lib/personas/custom-pools.ts`): async
   `resolvePoolTarget(poolKey)` — taxonomy first, then `custom_pools` — returns
   the `PoolTarget` shape the generation prompt already consumes. Slug helper
   dedupes against taxonomy keys and existing custom pools.
3. **`POST /api/personas/pools`** body `{prompt, name?}`: one `generate()` call
   (`role: "generator"`, new `PoolSpecSchema`) turns the prompt into
   `{name, key, description, seedHints}`; row inserted; returns the new pool.
   Generation of members stays in the existing generate endpoint (two-step
   client flow) so each route keeps one job.
4. **`POST /api/personas/generate`** accepts custom pool keys via
   `resolvePoolTarget`.
5. **Planner catalog**: planning stage loads custom pool definitions and uses
   their name/description in `buildCatalog` instead of the raw-key fallback.
6. **UI**: "New pool" button in the persona library opens a dialog (Base UI
   dialog + textarea): describe the population, pick a batch size, submit →
   create pool → generate first batch → navigate into the pool. `PoolBrowser`
   renders `custom` as its own "Custom pools" domain section (not the
   "outside the taxonomy" stray copy). Custom pools reuse the meter/top-up UI.
7. **Contract**: `docs/contracts.md` workstream D updated in the same commit
   (new endpoint, generate accepting custom keys, new table).

## Error handling

- Pool-spec LLM output slug-collides → dedupe with `-2`, `-3` suffixes.
- Empty/whitespace prompt → 400. LLM failure → 502 with message; nothing inserted.
- Mock mode (`MOCK_LLM=1`) works throughout — `generate()` synthesizes schemas.

## Testing

- Unit: slugify/dedupe + `resolvePoolTarget` (taxonomy hit, custom hit, miss).
- Route-shape tests follow the existing pattern (Vitest, mock LLM); UI verified
  manually against PGlite.
