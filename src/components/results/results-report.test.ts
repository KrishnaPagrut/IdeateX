import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import rawFixture from "@/fixtures/run-fixture.json";
import { toRunAggregates } from "@/components/run-live/adapt";
import type { AgentRunSnapshot, RunFixture, RunSnapshot } from "@/components/run-live/types";
import type { DiscussionOutput } from "@/lib/schemas/discussion";

import { FocusGroup, hasFocusGroup } from "./focus-group";
import { ResultsView } from "./results-view";

// The fixture is a full mock run WITH a discussion stage; its aggregates are
// engine-shaped (raw snapshot), adapted here exactly like the live page does.

const FIXTURE = rawFixture as unknown as RunFixture;

const RUN: RunSnapshot = {
  ...FIXTURE.run,
  aggregates: toRunAggregates(FIXTURE.run.aggregates, FIXTURE.agents),
};

/** The fixture without its discussion rows — the no-focus-group path. */
const AGENTS_WITHOUT_DISCUSSION = FIXTURE.agents.filter((a) => a.kind !== "discussion");

function discussionRow(
  id: string,
  parent: AgentRunSnapshot,
  out: Partial<DiscussionOutput>,
): AgentRunSnapshot {
  return {
    ...parent,
    id,
    kind: "discussion",
    label: `Discussion · ${parent.label}`,
    parentAgentRunId: parent.id,
    output: {
      reaction: "Hearing the gift buyers changed the math for me.",
      updatedAdoptionLikelihood: 50,
      changedMind: false,
      agreesWith: [],
      disagreesWith: [],
      keyPointHeard: "A subscription you gift is not a subscription you cancel.",
      heardAgentRunIds: [],
      ...out,
    } satisfies DiscussionOutput,
  };
}

/** Three synthetic replies over the discussion-free fixture: a controlled small case. */
function syntheticDiscussions(): {
  agents: AgentRunSnapshot[];
  parents: AgentRunSnapshot[];
} {
  const parents = AGENTS_WITHOUT_DISCUSSION.filter(
    (a) => a.kind === "persona" && a.status === "completed" && a.output != null,
  ).slice(0, 3);
  const [p0, p1, p2] = parents;
  const agents = [
    ...AGENTS_WITHOUT_DISCUSSION,
    discussionRow("d-0", p0, { updatedAdoptionLikelihood: 20, changedMind: true, agreesWith: ["Maya Chen"] }),
    discussionRow("d-1", p1, { updatedAdoptionLikelihood: 90, changedMind: true, disagreesWith: ["Tom Okafor"] }),
    discussionRow("d-2", p2, { updatedAdoptionLikelihood: 55 }),
  ];
  return { agents, parents };
}

describe("hasFocusGroup", () => {
  it("is true for the fixture (it carries a discussion stage)", () => {
    expect(hasFocusGroup(FIXTURE.agents)).toBe(true);
  });

  it("is false once discussion rows are stripped", () => {
    expect(hasFocusGroup(AGENTS_WITHOUT_DISCUSSION)).toBe(false);
  });
});

describe("FocusGroup", () => {
  it("renders shift stats, exchanges, and agree/disagree chips", () => {
    const { agents, parents } = syntheticDiscussions();
    const html = renderToStaticMarkup(
      createElement(FocusGroup, { agents, personas: FIXTURE.personas }),
    );

    expect(html).toContain("Minds changed");
    expect(html).toContain("/3</span>"); // 3 participants
    expect(html).toContain("Most consequential exchanges");
    expect(html).toContain("Key point heard");
    expect(html).toContain("Changed mind");
    expect(html).toContain("Maya Chen");
    expect(html).toContain("Tom Okafor");
    // Original score of the first parent appears as the "before" figure.
    const original = (parents[0].output as { adoptionLikelihood: number }).adoptionLikelihood;
    expect(html).toContain(`>${original}</span>`);
  });
});

describe("ResultsView report composition", () => {
  it("omits the focus-group section without discussion rows, numbering contiguous", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsView, {
        run: RUN,
        agents: AGENTS_WITHOUT_DISCUSSION,
        personas: FIXTURE.personas,
      }),
    );
    expect(html).not.toContain("Focus group");
    expect(html).toContain("Study design");
    expect(html).toContain("Adversarial review");
    expect(html).toContain("§06"); // 6 sections without a focus group
    expect(html).not.toContain("§07");
  });

  it("inserts the focus-group section between evidence and the red team", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsView, {
        run: RUN,
        agents: FIXTURE.agents,
        personas: FIXTURE.personas,
      }),
    );
    expect(html).toContain("Focus group");
    expect(html).toContain("§07"); // 7 sections with a focus group
    expect(html.indexOf('id="evidence"')).toBeLessThan(html.indexOf('id="focus-group"'));
    expect(html.indexOf('id="focus-group"')).toBeLessThan(html.indexOf('id="red-team"'));
  });

  it("falls back to an empty state without a synthesis", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsView, {
        run: { ...RUN, synthesis: null },
        agents: FIXTURE.agents,
        personas: FIXTURE.personas,
      }),
    );
    expect(html).toContain("No synthesis yet");
  });
});
