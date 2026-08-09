import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import rawFixture from "@/fixtures/run-fixture.json";
import type { AgentRunSnapshot, PersonaLite, RunFixture } from "@/components/run-live/types";
import type { DiscussionOutput } from "@/lib/schemas/discussion";

import { FocusGroup, hasFocusGroup } from "./focus-group";
import { ResultsView } from "./results-view";

// The fixture predates the focus-group stage, so discussion rows are layered
// on top of it here: this pins the contract (parent = original persona run,
// output = DiscussionOutput) until the fixture is regenerated with a
// discussion stage.

const FIXTURE = rawFixture as unknown as RunFixture;

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

function fixtureWithDiscussions(): {
  agents: AgentRunSnapshot[];
  personas: Record<string, PersonaLite>;
  parents: AgentRunSnapshot[];
} {
  const parents = FIXTURE.agents
    .filter((a) => a.kind === "persona" && a.status === "completed" && a.output != null)
    .slice(0, 3);
  const [p0, p1, p2] = parents;
  const agents = [
    ...FIXTURE.agents,
    discussionRow("d-0", p0, { updatedAdoptionLikelihood: 20, changedMind: true, agreesWith: ["Maya Chen"] }),
    discussionRow("d-1", p1, { updatedAdoptionLikelihood: 90, changedMind: true, disagreesWith: ["Tom Okafor"] }),
    discussionRow("d-2", p2, { updatedAdoptionLikelihood: 55 }),
  ];
  return { agents, personas: FIXTURE.personas, parents };
}

describe("hasFocusGroup", () => {
  it("is false for the fixture (no discussion stage)", () => {
    expect(hasFocusGroup(FIXTURE.agents)).toBe(false);
  });

  it("is true once completed discussion rows exist", () => {
    expect(hasFocusGroup(fixtureWithDiscussions().agents)).toBe(true);
  });
});

describe("FocusGroup", () => {
  it("renders shift stats, exchanges, and agree/disagree chips", () => {
    const { agents, personas, parents } = fixtureWithDiscussions();
    const html = renderToStaticMarkup(createElement(FocusGroup, { agents, personas }));

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
  it("omits the focus-group section for the fixture and keeps numbering contiguous", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsView, {
        run: FIXTURE.run,
        agents: FIXTURE.agents,
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
    const { agents, personas } = fixtureWithDiscussions();
    const html = renderToStaticMarkup(
      createElement(ResultsView, { run: FIXTURE.run, agents, personas }),
    );
    expect(html).toContain("Focus group");
    expect(html).toContain("§07"); // 7 sections with a focus group
    expect(html.indexOf('id="evidence"')).toBeLessThan(html.indexOf('id="focus-group"'));
    expect(html.indexOf('id="focus-group"')).toBeLessThan(html.indexOf('id="red-team"'));
  });

  it("falls back to an empty state without a synthesis", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsView, {
        run: { ...FIXTURE.run, synthesis: null },
        agents: FIXTURE.agents,
        personas: FIXTURE.personas,
      }),
    );
    expect(html).toContain("No synthesis yet");
  });
});
