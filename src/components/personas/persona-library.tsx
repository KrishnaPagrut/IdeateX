"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon, PlusIcon, ArrowLeftIcon } from "lucide-react";

import type { Persona } from "@/lib/db/schema";
import type { PoolInfo } from "@/app/api/personas/pools/route";
import { allSubdomains } from "@/lib/personas/taxonomy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { INCOME_BANDS } from "./income-bands";
import { MatrixLoader } from "./matrix-loader";
import { NewPoolDialog } from "./new-pool-dialog";
import { PersonaCard } from "./persona-card";
import { PoolBrowser } from "./pool-browser";
import { PoolMeter, POOL_TARGET } from "./pool-meter";

interface Filters {
  q: string;
  archetype: string | null;
  incomeBand: string | null;
}

const NO_FILTERS: Filters = { q: "", archetype: null, incomeBand: null };

export function PersonaLibrary() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pool selection lives in the URL so pool views are deep-linkable and
  // back/forward walks the browse history.
  const selectedPool = searchParams.get("pool");
  const showAll = searchParams.get("view") === "all";

  const [pools, setPools] = React.useState<PoolInfo[] | null>(null);
  const [personas, setPersonas] = React.useState<Persona[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [archetypes, setArchetypes] = React.useState<string[]>([]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);

  const hasFilters = Boolean(debouncedQ || filters.archetype || filters.incomeBand);
  // The library is two-level: the pool catalog (landing), and the roster grid
  // (a pool is open, a filter is active, or "all personas" was requested).
  const gridMode = selectedPool !== null || hasFilters || showAll;

  // Bump to refetch after mutations (e.g. a generation batch lands).
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/personas/pools", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as { pools: PoolInfo[] };
        setPools(body.pools);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load pools");
      });
    return () => controller.abort();
  }, [refreshKey]);

  React.useEffect(() => {
    if (!gridMode) return;
    const controller = new AbortController();
    async function run() {
      try {
        const params = new URLSearchParams();
        if (selectedPool) {
          const [domain, subdomain] = selectedPool.split("/");
          params.set("domain", domain);
          params.set("subdomain", subdomain);
        }
        if (debouncedQ) params.set("q", debouncedQ);
        if (filters.archetype) params.set("archetype", filters.archetype);
        if (filters.incomeBand) params.set("incomeBand", filters.incomeBand);

        const res = await fetch(`/api/personas?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as { personas: Persona[] };
        setPersonas(body.personas);
        setError(null);
        // Grow the archetype options from everything we've seen so a filtered
        // result set never shrinks the dropdown.
        setArchetypes((prev) => {
          const next = new Set(prev);
          for (const p of body.personas) next.add(p.archetype);
          return [...next].sort((a, b) => a.localeCompare(b));
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load personas");
      }
    }
    void run();
    return () => controller.abort();
  }, [gridMode, selectedPool, debouncedQ, filters.archetype, filters.incomeBand, refreshKey]);

  /** Batch size that tops a pool up toward its target without overshooting far. */
  function fillCount(poolCount: number): number {
    return Math.max(6, Math.min(12, POOL_TARGET - poolCount));
  }

  async function generateInto(pool: string | null, poolCount = 0) {
    setGenerating(true);
    try {
      const count = pool ? fillCount(poolCount) : 20;
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pool ? { count, pool } : { count }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const body = (await res.json()) as { personas: Persona[] };
      toast.success(
        pool
          ? `Added ${body.personas.length} personas to ${pool}`
          : `Added ${body.personas.length} personas to the library`,
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // push (not replace) so the browser's back button walks pool → catalog.
  function openPool(key: string) {
    router.push(`/personas?pool=${encodeURIComponent(key)}`, { scroll: false });
  }

  function backToPools() {
    router.push("/personas", { scroll: false });
    setFilters(NO_FILTERS);
  }

  // Taxonomy pools vs. strays (e.g. general/general): the header reconciles
  // both so "N active" always adds up with what the catalog shows.
  const taxonomyKeys = React.useMemo(
    () => new Set(allSubdomains().map((s) => `${s.domainKey}/${s.key}`)),
    [],
  );
  const totalCount = pools?.reduce((sum, p) => sum + p.count, 0) ?? null;
  const seededCount =
    pools?.filter((p) => p.count > 0 && taxonomyKeys.has(`${p.domain}/${p.subdomain}`)).length ??
    null;
  // Custom pools are real pools, not strays — only truly unpooled personas
  // (e.g. general/general) count as "outside the taxonomy".
  const unpooledCount =
    pools
      ?.filter((p) => p.domain !== "custom" && !taxonomyKeys.has(`${p.domain}/${p.subdomain}`))
      .reduce((sum, p) => sum + p.count, 0) ?? 0;
  const count = personas?.length ?? 0;
  const initialLoading = pools === null && !error;
  const libraryEmpty = pools !== null && totalCount === 0 && !gridMode;
  const selected = selectedPool
    ? (pools?.find((p) => `${p.domain}/${p.subdomain}` === selectedPool) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-14">
      <Toaster position="bottom-right" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-2xs tracking-eyebrow uppercase text-muted-foreground">
            Synthetic population
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-foreground">
            Persona library
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {totalCount === null
              ? "N = —"
              : gridMode
                ? `N = ${personas === null ? "—" : count} shown of ${totalCount} active`
                : `N = ${totalCount} active · ${seededCount}/${taxonomyKeys.size} pools seeded${
                    unpooledCount > 0 ? ` · ${unpooledCount} outside the taxonomy` : ""
                  }`}
          </p>
        </div>
        {!selectedPool && !libraryEmpty && (
          <div className="flex flex-wrap items-center gap-2">
            <NewPoolDialog
              onCreated={(key) => {
                setRefreshKey((k) => k + 1);
                openPool(key);
              }}
            />
            <Button onClick={() => generateInto(null)} disabled={generating}>
              {generating ? (
                <>
                  <MatrixLoader size={16} label="Generating personas" />
                  Generating…
                </>
              ) : (
                <>
                  <PlusIcon data-icon="inline-start" />
                  Generate 20 more
                </>
              )}
            </Button>
          </div>
        )}
      </header>

      {!libraryEmpty && !initialLoading && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder={
                selectedPool ? "Search this pool" : "Search name or occupation"
              }
              className="pl-8"
              aria-label="Search personas by name or occupation"
            />
          </div>
          <Select
            items={[
              { value: null, label: "All archetypes" },
              ...archetypes.map((a) => ({ value: a, label: a })),
            ]}
            value={filters.archetype}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, archetype: value as string | null }))
            }
          >
            <SelectTrigger className="min-w-40" aria-label="Filter by archetype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All archetypes</SelectItem>
              {archetypes.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={[
              { value: null, label: "All incomes" },
              ...INCOME_BANDS.map((b) => ({ value: b.value as string, label: b.label })),
            ]}
            value={filters.incomeBand}
            onValueChange={(value) =>
              setFilters((f) => ({ ...f, incomeBand: value as string | null }))
            }
          >
            <SelectTrigger className="min-w-36" aria-label="Filter by income band">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All incomes</SelectItem>
              {INCOME_BANDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
              Clear
            </Button>
          )}
          {!gridMode && (
            <Button
              variant="ghost"
              onClick={() => router.push("/personas?view=all", { scroll: false })}
            >
              All personas
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Could not load the library: {error}. Refresh the page to try again.
        </div>
      )}

      {initialLoading && (
        <div className="mt-24 flex flex-col items-center gap-3">
          <MatrixLoader size={28} label="Loading persona library" />
          <p className="font-mono text-2xs tracking-eyebrow uppercase text-muted-foreground">
            Loading population
          </p>
        </div>
      )}

      {libraryEmpty && (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-border p-12 text-center">
          <MatrixLoader size={28} label="" className="opacity-60" />
          <h2 className="mt-4 font-serif text-xl font-bold tracking-tight">
            The population is empty
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Personas live in {pools?.length ?? 22} pools — domain/subdomain groups of ~
            {POOL_TARGET} people that planners cast from. Seed every pool from the command
            line:
          </p>
          <code className="mt-3 rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
            pnpm seed-personas
          </code>
          <p className="mt-4 text-sm text-muted-foreground">
            Or generate a first batch right here — “Generate 20 more” adds 20 personas.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => generateInto(null)} disabled={generating}>
              {generating ? (
                <>
                  <MatrixLoader size={16} label="Generating personas" />
                  Generating…
                </>
              ) : (
                <>
                  <PlusIcon data-icon="inline-start" />
                  Generate 20 more
                </>
              )}
            </Button>
            <NewPoolDialog
              onCreated={(key) => {
                setRefreshKey((k) => k + 1);
                openPool(key);
              }}
            />
          </div>
        </div>
      )}

      {/* Catalog: the census index of pools. */}
      {!gridMode && !libraryEmpty && pools !== null && (
        <PoolBrowser pools={pools} onSelect={openPool} />
      )}

      {/* Roster: a pool is open, a filter is active, or "all personas". */}
      {gridMode && (
        <>
          <div className="mt-6">
            <button
              type="button"
              onClick={backToPools}
              className="inline-flex items-center gap-1.5 font-mono text-2xs tracking-eyebrow uppercase text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              Pools
            </button>

            {selected && (
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-mono text-3xs tracking-wide text-muted-foreground/80">
                    {selectedPool}
                  </p>
                  <h2 className="mt-0.5 font-serif text-xl font-bold tracking-tight text-foreground">
                    {selected.name}
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    {selected.description}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <PoolMeter count={selected.count} />
                    <span className="font-mono text-3xs tracking-wide text-muted-foreground">
                      {selected.count} / ~{POOL_TARGET}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => generateInto(selectedPool, selected.count)}
                  disabled={generating}
                  variant={selected.count === 0 ? "default" : "outline"}
                >
                  {generating ? (
                    <>
                      <MatrixLoader size={16} label="Generating personas" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <PlusIcon data-icon="inline-start" />
                      Generate {fillCount(selected.count)} into this pool
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {personas === null && !error && (
            <div className="mt-16 flex flex-col items-center gap-3">
              <MatrixLoader size={24} label="Loading personas" />
            </div>
          )}

          {personas !== null && count === 0 && (
            <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-border p-12 text-center">
              {selected && selected.count === 0 && !hasFilters ? (
                <>
                  <h2 className="font-serif text-lg font-bold tracking-tight">
                    This pool is empty
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    0 of ~{POOL_TARGET} people. Generate the first batch so planners can
                    cast from {selected.name}.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => generateInto(selectedPool, 0)}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <MatrixLoader size={16} label="Generating personas" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <PlusIcon data-icon="inline-start" />
                        Generate this pool
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="font-serif text-lg font-bold tracking-tight">
                    No personas match
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try a different search, or clear the filters.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setFilters(NO_FILTERS)}
                  >
                    Clear filters
                  </Button>
                </>
              )}
            </div>
          )}

          {personas !== null && count > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {personas.map((p) => (
                <PersonaCard key={p.id} persona={p} showPool={!selectedPool} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
