import { describe, expect, it } from "vitest";

import {
  buildCastingSheet,
  deriveSeed,
  renderCastingSheet,
  sheetSummary,
  WILDCARD_BANK,
} from "./casting-sheet";

describe("buildCastingSheet", () => {
  it("is deterministic for a given seed", () => {
    expect(buildCastingSheet(7)).toEqual(buildCastingSheet(7));
    expect(sheetSummary(buildCastingSheet(123))).toBe(sheetSummary(buildCastingSheet(123)));
  });

  it("varies across seeds (not one fixed split)", () => {
    const summaries = new Set(
      Array.from({ length: 50 }, (_, i) => sheetSummary(buildCastingSheet(i))),
    );
    expect(summaries.size).toBeGreaterThan(40);
  });

  it("draws gender quotas within bounds, summing to 100", () => {
    for (let seed = 0; seed < 500; seed++) {
      const { women, men, nonbinary } = buildCastingSheet(seed).genderQuota;
      expect(women + men + nonbinary).toBe(100);
      expect(women).toBeGreaterThanOrEqual(40);
      expect(women).toBeLessThanOrEqual(55);
      expect(men).toBeGreaterThanOrEqual(40);
      expect(men).toBeLessThanOrEqual(55);
      expect(nonbinary).toBeGreaterThanOrEqual(3);
      expect(nonbinary).toBeLessThanOrEqual(8);
    }
  });

  it("picks two distinct wildcards and two distinct household emphases", () => {
    for (let seed = 0; seed < 200; seed++) {
      const sheet = buildCastingSheet(seed);
      expect(sheet.wildcards[0].key).not.toBe(sheet.wildcards[1].key);
      expect(sheet.householdEmphasis[0]).not.toBe(sheet.householdEmphasis[1]);
    }
  });

  it("has a wildcard bank of at least 30 distinct entries", () => {
    expect(WILDCARD_BANK.length).toBeGreaterThanOrEqual(30);
    expect(new Set(WILDCARD_BANK.map((w) => w.key)).size).toBe(WILDCARD_BANK.length);
  });
});

describe("deriveSeed", () => {
  it("is stable and part-sensitive", () => {
    expect(deriveSeed(7, "consumers/budget-households", 0)).toBe(
      deriveSeed(7, "consumers/budget-households", 0),
    );
    expect(deriveSeed(7, "consumers/budget-households", 0)).not.toBe(
      deriveSeed(7, "consumers/budget-households", 1),
    );
    expect(deriveSeed(7, "a/b", 0)).not.toBe(deriveSeed(8, "a/b", 0));
    expect(deriveSeed(7, "ab", "c")).not.toBe(deriveSeed(7, "a", "bc"));
  });
});

describe("renderCastingSheet", () => {
  it("renders every constraint of the sheet", () => {
    const sheet = buildCastingSheet(42);
    const text = renderCastingSheet(sheet, 12);
    expect(text).toContain("HARD requirements");
    expect(text).toContain(`${sheet.genderQuota.women}% women`);
    expect(text).toContain(sheet.ageCurve);
    expect(text).toContain(sheet.incomeSpread);
    expect(text).toContain(sheet.geographyMix);
    expect(text).toContain(sheet.householdEmphasis[0]);
    expect(text).toContain(sheet.wildcards[0].key);
    expect(text).toContain(sheet.wildcards[1].text);
  });
});
