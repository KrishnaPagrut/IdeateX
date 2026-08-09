import { describe, expect, it } from "vitest";

import { launchKitStatusFromItems } from "./use-launch-kit";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";

const item = {
  id: "lk-01",
  runId: "run-1",
  kind: "launch",
  state: "draft",
  title: "Launch day",
  body: "We're live.",
  dayOffset: 0,
  platform: "x",
  targetCohorts: [],
  purpose: "announce",
  callToAction: "Try it",
  hashtags: [],
  imagePrompt: null,
  imageUrl: null,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
} satisfies CampaignItemSnapshot;

describe("launchKitStatusFromItems", () => {
  it("treats an empty list as not-yet-generated (contracts: GET may return [])", () => {
    expect(launchKitStatusFromItems([])).toBe("none");
  });

  it("treats a non-empty list as ready", () => {
    expect(launchKitStatusFromItems([item])).toBe("ready");
  });
});
