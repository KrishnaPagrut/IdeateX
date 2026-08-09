import { describe, expect, it } from "vitest";

import { buildGraph } from "./build-graph";
import { CHIP_H, CHIP_W, dimsForKind, HUB_H, HUB_W, isChipKind } from "./graph-layout";
import type { AgentLite } from "./types";

function agent(partial: Partial<AgentLite> & Pick<AgentLite, "id" | "kind" | "label">): AgentLite {
  return {
    status: "completed",
    parentAgentRunId: null,
    personaId: null,
    segment: null,
    ...partial,
  };
}

describe("graph-layout dims", () => {
  it("treats personas and discussion replies as chips, hubs otherwise", () => {
    expect(isChipKind("persona")).toBe(true);
    expect(isChipKind("discussion")).toBe(true);
    expect(isChipKind("planner")).toBe(false);
    expect(dimsForKind("discussion")).toEqual({ width: CHIP_W, height: CHIP_H });
    expect(dimsForKind("framing")).toEqual({ width: HUB_W, height: HUB_H });
  });

  it("lays out discussion nodes in chip slots so they cannot overlap neighbors", () => {
    const planner = agent({ id: "p1", kind: "planner", label: "Planner A", segment: "Seg" });
    const personas = Array.from({ length: 4 }, (_, i) =>
      agent({
        id: `a${i}`,
        kind: "persona",
        label: `Persona ${i}`,
        parentAgentRunId: "p1",
        personaId: `per-${i}`,
      }),
    );
    const replies = personas.map((pa, i) =>
      agent({
        id: `d${i}`,
        kind: "discussion",
        label: `Persona ${i} · reply`,
        parentAgentRunId: pa.id,
        personaId: pa.personaId,
      }),
    );

    const { nodes } = buildGraph(
      [agent({ id: "f", kind: "framing", label: "Framing" }), planner, ...personas, ...replies],
      {},
    );

    const discussionNodes = nodes.filter((n) => n.data.agent.kind === "discussion");
    expect(discussionNodes).toHaveLength(4);
    for (const n of discussionNodes) {
      expect(n.width).toBe(CHIP_W);
      expect(n.height).toBe(CHIP_H);
    }

    // No two discussion nodes in the same row may occupy overlapping x-ranges.
    const byY = new Map<number, typeof discussionNodes>();
    for (const n of discussionNodes) {
      const y = n.position.y;
      const row = byY.get(y) ?? [];
      row.push(n);
      byY.set(y, row);
    }
    for (const row of byY.values()) {
      const sorted = [...row].sort((a, b) => a.position.x - b.position.x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        expect(cur.position.x).toBeGreaterThanOrEqual(prev.position.x + CHIP_W);
      }
    }
  });
});
