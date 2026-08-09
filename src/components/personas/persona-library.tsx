"use client";

import * as React from "react";
import { toast } from "sonner";
import { SearchIcon, PlusIcon } from "lucide-react";

import type { Persona } from "@/lib/db/schema";
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
import { PersonaCard } from "./persona-card";

interface Filters {
  q: string;
  archetype: string | null;
  incomeBand: string | null;
}

export function PersonaLibrary() {
  const [personas, setPersonas] = React.useState<Persona[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Filters>({
    q: "",
    archetype: null,
    incomeBand: null,
  });
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [archetypes, setArchetypes] = React.useState<string[]>([]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);

  const hasFilters = Boolean(debouncedQ || filters.archetype || filters.incomeBand);

  // Bump to refetch after mutations (e.g. a generation batch lands).
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    async function run() {
      try {
        const params = new URLSearchParams();
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
  }, [debouncedQ, filters.archetype, filters.incomeBand, refreshKey]);

  async function generateMore() {
    setGenerating(true);
    try {
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 20 }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const body = (await res.json()) as { personas: Persona[] };
      toast.success(`Added ${body.personas.length} personas to the library`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const count = personas?.length ?? 0;
  const initialLoading = personas === null && !error;
  const libraryEmpty = personas !== null && count === 0 && !hasFilters;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <Toaster position="bottom-right" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
            Synthetic population
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Persona library
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {personas === null ? "N = —" : `N = ${count} active${hasFilters ? " (filtered)" : ""}`}
          </p>
        </div>
        <Button onClick={generateMore} disabled={generating}>
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
      </header>

      {!libraryEmpty && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search name or occupation"
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
            <Button
              variant="ghost"
              onClick={() => setFilters({ q: "", archetype: null, incomeBand: null })}
            >
              Clear
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
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
            Loading population
          </p>
        </div>
      )}

      {libraryEmpty && (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-border p-12 text-center">
          <MatrixLoader size={28} label="" className="opacity-60" />
          <h2 className="mt-4 text-lg font-semibold tracking-tight">
            The population is empty
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Personas are the synthetic population your ideas get tested against. Seed the
            standard library of 120 from the command line:
          </p>
          <code className="mt-3 rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
            pnpm seed-personas
          </code>
          <p className="mt-4 text-sm text-muted-foreground">
            Or generate a first batch right here — “Generate 20 more” above adds 20 personas.
          </p>
        </div>
      )}

      {personas !== null && count === 0 && hasFilters && (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-border p-12 text-center">
          <h2 className="text-base font-semibold tracking-tight">No personas match</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different search, or clear the filters.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setFilters({ q: "", archetype: null, incomeBand: null })}
          >
            Clear filters
          </Button>
        </div>
      )}

      {personas !== null && count > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {personas.map((p) => (
            <PersonaCard key={p.id} persona={p} />
          ))}
        </div>
      )}
    </div>
  );
}
