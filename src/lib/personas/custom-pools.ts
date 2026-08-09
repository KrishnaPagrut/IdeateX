import { and, eq } from "drizzle-orm";

import { db, customPools, type CustomPool } from "@/lib/db";
import { findSubdomain } from "./taxonomy";
import type { PoolTarget } from "@/lib/prompts/persona-gen";

// ---------------------------------------------------------------------------
// Custom pools: user-created pools defined from a free-text prompt, stored in
// the custom_pools table under the reserved "custom" domain. They extend the
// static taxonomy at runtime — generation and planner casting resolve pool
// keys through here so "custom/risk-averse-retirees" works anywhere
// "consumers/budget-households" does.
// ---------------------------------------------------------------------------

/** The reserved domain every prompt-created pool lives under. */
export const CUSTOM_DOMAIN = "custom";

/** "Risk-averse retirees!" → "risk-averse-retirees"; empty on degenerate input. */
export function slugifyPoolName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** First of `slug`, `slug-2`, `slug-3`… not in `taken`. */
export function dedupeSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function toPoolTarget(pool: CustomPool): PoolTarget {
  return {
    domainKey: pool.domain,
    subdomainKey: pool.subdomain,
    name: pool.name,
    description: pool.description,
    seedHints: pool.seedHints,
  };
}

/**
 * Resolve a "domain/subdomain" key to a generation target: the static
 * taxonomy first, then the custom_pools table. Null when neither knows it.
 */
export async function resolvePoolTarget(poolKey: string): Promise<PoolTarget | null> {
  const [domainKey, subdomainKey] = poolKey.split("/");
  if (!domainKey || !subdomainKey) return null;

  const sub = findSubdomain(domainKey, subdomainKey);
  if (sub) {
    return {
      domainKey,
      subdomainKey,
      name: sub.name,
      description: sub.description,
      seedHints: sub.seedHints,
    };
  }

  const [row] = await db
    .select()
    .from(customPools)
    .where(and(eq(customPools.domain, domainKey), eq(customPools.subdomain, subdomainKey)))
    .limit(1);
  return row ? toPoolTarget(row) : null;
}

export async function listCustomPools(): Promise<CustomPool[]> {
  return db.select().from(customPools);
}
