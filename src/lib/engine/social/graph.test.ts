import { describe, expect, test } from "vitest";

import type { Persona } from "@/lib/db";
import type { SimTraits } from "@/lib/schemas/marketing";
import { buildFollowGraph, type GraphMember } from "./graph";
import { deriveTraits } from "./traits";

const basePersona = (id: string, over: Partial<Persona["psychographics"]> = {}): Persona =>
  ({
    id,
    name: `P ${id}`,
    archetype: "tester",
    domain: "general",
    subdomain: "general",
    demographics: {
      age: 34,
      gender: "woman",
      location: "Toronto",
      incomeBand: "$50-75k",
      education: "BA",
      occupation: "designer",
    },
    psychographics: {
      techSavviness: 3,
      riskTolerance: 3,
      priceSensitivity: 3,
      openness: 3,
      values: ["honesty"],
      spendingHabits: "moderate",
      ...over,
    },
    backstory: "",
    avatarSeed: "x",
    tags: [],
    source: "seed",
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }) as Persona;

const baseline: SimTraits = { humor: 0.5, skepticism: 0.5, influence: 0.4, persuadability: 0.5 };

describe("deriveTraits", () => {
  test("deterministic for the same persona + seed", () => {
    const a = deriveTraits(basePersona("p1"), baseline, 42);
    expect(deriveTraits(basePersona("p1"), baseline, 42)).toEqual(a);
  });

  test("varies across personas and seeds, stays in [0,1]", () => {
    const a = deriveTraits(basePersona("p1"), baseline, 42);
    const b = deriveTraits(basePersona("p2"), baseline, 42);
    const c = deriveTraits(basePersona("p1"), baseline, 43);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    for (const t of [a, b, c]) {
      for (const v of [...Object.values(t.traits), ...Object.values(t.engagement)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test("psychographics pull traits: closed skeptic > open optimist on skepticism", () => {
    const skeptic = deriveTraits(
      basePersona("p1", { openness: 1, priceSensitivity: 5 }),
      baseline,
      42,
    );
    const optimist = deriveTraits(
      basePersona("p1", { openness: 5, priceSensitivity: 1 }),
      baseline,
      42,
    );
    expect(skeptic.traits.skepticism).toBeGreaterThan(optimist.traits.skepticism);
  });
});

function members(n: number, cohorts: string[]): GraphMember[] {
  return Array.from({ length: n }, (_, i) => ({
    personaId: `p${i}`,
    cohort: cohorts[i % cohorts.length],
    influence: (i % 10) / 10,
  }));
}

describe("buildFollowGraph", () => {
  test("deterministic for the same members + seed", () => {
    const ms = members(30, ["a", "b", "c"]);
    expect(buildFollowGraph(ms, 7)).toEqual(buildFollowGraph(ms, 7));
  });

  test("no self-follows, no duplicate edges, valid endpoints", () => {
    const ms = members(30, ["a", "b"]);
    const ids = new Set(ms.map((m) => m.personaId));
    const edges = buildFollowGraph(ms, 7);
    const seen = new Set<string>();
    for (const e of edges) {
      expect(e.from).not.toBe(e.to);
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
      const key = `${e.from}->${e.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("every member follows someone; cross-cohort ties exist", () => {
    const ms = members(24, ["a", "b", "c"]);
    const cohortOf = new Map(ms.map((m) => [m.personaId, m.cohort]));
    const edges = buildFollowGraph(ms, 11);
    const followers = new Set(edges.map((e) => e.from));
    expect(followers.size).toBe(ms.length);
    expect(edges.some((e) => cohortOf.get(e.from) !== cohortOf.get(e.to))).toBe(true);
  });

  test("handles a tiny audience without hanging", () => {
    const edges = buildFollowGraph(members(2, ["a"]), 3);
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });
});
