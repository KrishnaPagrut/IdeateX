import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import rawFixture from "@/fixtures/launch-kit-fixture.json";
import type { CampaignItemSnapshot } from "@/lib/schemas/launch";
import type { ImageStreamState } from "@/lib/hooks/use-image-stream";

import { AssetsView } from "./assets-view";
import { CalendarView } from "./calendar-view";
import { ListView } from "./list-view";
import { LaunchKitView } from "./launch-kit-view";

const ITEMS = (rawFixture as { items: CampaignItemSnapshot[] }).items;

const IDLE: ImageStreamState = { urls: {}, pending: 0, received: 0, active: false };
const noopPatch = async () => {};
const noop = () => {};

function renderView(
  status: "loading" | "none" | "generating" | "ready",
  items: CampaignItemSnapshot[] | null,
  stream: ImageStreamState = IDLE,
) {
  return renderToStaticMarkup(
    createElement(LaunchKitView, {
      items,
      status,
      error: null,
      onGenerate: noop,
      stream,
      onPatch: noopPatch,
    }),
  );
}

describe("LaunchKitView states", () => {
  it("empty state pitches generation with the cost note", () => {
    const html = renderView("none", null);
    expect(html).toContain("Generate launch kit");
    expect(html).toContain("a few cents of images");
    expect(html).toContain("From winning strategy to launch calendar");
  });

  it("generating state shows the narrative loader", () => {
    const html = renderView("generating", null);
    expect(html).toContain("Expanding the winning strategy into a dated plan");
    expect(html).not.toContain("Generate launch kit");
  });

  it("ready state shows plan facts, the view switcher, and the calendar", () => {
    const html = renderView("ready", ITEMS);
    expect(html).toContain("9 items");
    expect(html).toContain("3 approved"); // fixture: lk-01, lk-04, lk-05
    expect(html).toContain("calendar");
    expect(html).toContain("assets");
    expect(html).toContain("Launch day");
    expect(html).toContain("D-7");
  });

  it("ready state surfaces stream progress while visuals generate", () => {
    const html = renderView("ready", ITEMS, { urls: {}, pending: 4, received: 1, active: true });
    expect(html).toContain("Generating visuals — 1 of 4");
  });
});

describe("CalendarView", () => {
  it("always renders launch day and compresses quiet gaps", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarView, { items: ITEMS, selectedId: null, onSelect: noop }),
    );
    expect(html).toContain("Launch day");
    expect(html).toContain("D+14");
    // Days 8–13 are empty → one 6-day gap marker.
    expect(html).toContain("6d");
  });
});

describe("ListView", () => {
  it("renders one row per item, day-sorted, with state chips", () => {
    const html = renderToStaticMarkup(
      createElement(ListView, { items: ITEMS, selectedId: null, onSelect: noop }),
    );
    expect(html).toContain("approved");
    expect(html).toContain("draft");
    expect(html.indexOf("D-7")).toBeLessThan(html.indexOf("D+14"));
  });
});

describe("AssetsView", () => {
  it("shimmers tiles without a url and swaps in streamed urls", () => {
    const streamedUrl = "https://example.com/streamed.png";
    const imageFor = (item: CampaignItemSnapshot) =>
      item.imageUrl ?? (item.id === "lk-03" ? streamedUrl : null);
    const html = renderToStaticMarkup(
      createElement(AssetsView, { items: ITEMS, imageFor, selectedId: null, onSelect: noop }),
    );
    // 4 fixture items lack a url; one is resolved by the stream → 3 skeletons.
    expect(html.match(/Generating image/g)?.length).toBe(3);
    expect(html).toContain(streamedUrl);
  });
});
