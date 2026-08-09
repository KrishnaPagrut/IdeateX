"use client";

import * as React from "react";

import { TAXONOMY } from "@/lib/personas/taxonomy";
import type { PoolInfo } from "@/app/api/personas/pools/route";
import { AvatarStack } from "./avatar-stack";
import { PoolMeter, POOL_TARGET } from "./pool-meter";

/** Display name for a domain key: taxonomy first, then a readable fallback. */
function domainName(key: string): string {
  if (key === "general") return "General";
  return TAXONOMY.find((d) => d.key === key)?.name ?? key;
}

function PoolCard({
  pool,
  onSelect,
}: {
  pool: PoolInfo;
  onSelect: (key: string) => void;
}) {
  const key = `${pool.domain}/${pool.subdomain}`;
  const empty = pool.count === 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      className="group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 text-left outline-none transition-colors hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {pool.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-muted-foreground/80">
            {key}
          </p>
        </div>
        <AvatarStack members={pool.sample} className="shrink-0" />
      </div>

      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {pool.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-2.5">
        <PoolMeter count={pool.count} />
        {empty ? (
          <span className="shrink-0 font-mono text-[10px] tracking-wide text-primary group-hover:underline">
            0 of ~{POOL_TARGET} — generate
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground">
            {pool.count} / ~{POOL_TARGET}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * The census index: every pool of the population, grouped by domain, with
 * live counts against the ~25-person seeding target. Selecting a pool opens
 * its roster; empty pools invite generation.
 */
export function PoolBrowser({
  pools,
  onSelect,
}: {
  pools: PoolInfo[];
  onSelect: (key: string) => void;
}) {
  const byDomain = new Map<string, PoolInfo[]>();
  for (const p of pools) {
    const list = byDomain.get(p.domain) ?? [];
    list.push(p);
    byDomain.set(p.domain, list);
  }
  // Taxonomy order first, stray domains (e.g. general) last.
  const order = [...TAXONOMY.map((d) => d.key), ...byDomain.keys()].filter(
    (key, i, all) => byDomain.has(key) && all.indexOf(key) === i,
  );

  return (
    <div className="mt-8 flex flex-col gap-10">
      {order.map((domainKey) => {
        const domainPools = byDomain.get(domainKey)!;
        const people = domainPools.reduce((sum, p) => sum + p.count, 0);
        return (
          <section key={domainKey}>
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
              <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-foreground/80">
                {domainName(domainKey)}
              </h2>
              <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
                {domainPools.length} {domainPools.length === 1 ? "pool" : "pools"} · {people}{" "}
                {people === 1 ? "person" : "people"}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {domainPools.map((p) => (
                <PoolCard key={`${p.domain}/${p.subdomain}`} pool={p} onSelect={onSelect} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
