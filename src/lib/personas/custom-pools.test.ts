import { describe, expect, it } from "vitest";

import { dedupeSlug, resolvePoolTarget, slugifyPoolName } from "./custom-pools";

describe("slugifyPoolName", () => {
  it("kebab-cases and strips punctuation and diacritics", () => {
    expect(slugifyPoolName("Risk-averse retirees!")).toBe("risk-averse-retirees");
    expect(slugifyPoolName("  Café régulars & friends ")).toBe("cafe-regulars-friends");
  });

  it("returns empty string on degenerate input", () => {
    expect(slugifyPoolName("!!!")).toBe("");
  });

  it("caps length at 60", () => {
    expect(slugifyPoolName("x".repeat(100))).toHaveLength(60);
  });
});

describe("dedupeSlug", () => {
  it("returns the slug when free", () => {
    expect(dedupeSlug("gamers", new Set())).toBe("gamers");
  });

  it("suffixes -2, -3… when taken", () => {
    expect(dedupeSlug("gamers", new Set(["gamers"]))).toBe("gamers-2");
    expect(dedupeSlug("gamers", new Set(["gamers", "gamers-2"]))).toBe("gamers-3");
  });
});

describe("resolvePoolTarget", () => {
  it("resolves taxonomy pools without touching the DB", async () => {
    const target = await resolvePoolTarget("consumers/budget-households");
    expect(target).toMatchObject({
      domainKey: "consumers",
      subdomainKey: "budget-households",
      name: "Budget households",
    });
    expect(target?.seedHints.length).toBeGreaterThan(0);
  });

  it("returns null for malformed keys", async () => {
    expect(await resolvePoolTarget("no-slash")).toBeNull();
    expect(await resolvePoolTarget("/missing-domain")).toBeNull();
  });
});
