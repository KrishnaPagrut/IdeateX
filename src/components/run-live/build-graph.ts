import type { Edge, Node } from "@xyflow/react";

import {
  CHIP_GAP_X,
  CHIP_GAP_Y,
  CHIP_H,
  CHIP_W,
  CLUSTER_GAP,
  dimsForKind,
  HUB_W,
  REPLY_GAP,
  ROW_FRAMING_Y,
  ROW_PERSONA_Y,
  ROW_PLANNER_Y,
} from "./graph-layout";
import type { AgentLite, PersonaLite } from "./types";

export type GraphAgentNode = Node<
  {
    agent: AgentLite;
    persona: PersonaLite | null;
  },
  "agent"
>;

/** Reads the focus-group interaction targets from a discussion agent's output. */
function heardIds(agent: AgentLite): string[] {
  const output = (agent as { output?: unknown }).output;
  if (
    output &&
    typeof output === "object" &&
    Array.isArray((output as { heardAgentRunIds?: unknown }).heardAgentRunIds)
  ) {
    return (output as { heardAgentRunIds: string[] }).heardAgentRunIds;
  }
  return [];
}

/**
 * Deterministic staged layout: framing → planners → persona chips → focus-group
 * reply chips → critics/synthesis. Positions are a pure function of the agent
 * list so the graph stays stable while agents stream in.
 */
export function buildGraph(
  agents: AgentLite[],
  personas: Record<string, PersonaLite>,
  selectedId?: string | null,
): { nodes: GraphAgentNode[]; edges: Edge[] } {
  const framing = agents.filter((a) => a.kind === "framing");
  const planners = agents.filter((a) => a.kind === "planner");
  const personaAgents = agents.filter((a) => a.kind === "persona");
  const discussions = agents.filter((a) => a.kind === "discussion");
  const critiques = agents.filter((a) => a.kind === "critique");
  const synthesis = agents.filter((a) => a.kind === "synthesis");

  // Cluster personas by parent planner (preserving planner order); personas
  // with an unknown parent get a trailing cluster so nothing is dropped.
  const clusters: Array<{
    plannerId: string | null;
    members: AgentLite[];
    replies: AgentLite[];
  }> = planners.map((p) => ({ plannerId: p.id, members: [], replies: [] }));
  const orphans: AgentLite[] = [];
  for (const pa of personaAgents) {
    const c = clusters.find((cl) => cl.plannerId === pa.parentAgentRunId);
    if (c) c.members.push(pa);
    else orphans.push(pa);
  }
  if (orphans.length > 0) clusters.push({ plannerId: null, members: orphans, replies: [] });

  // Focus-group replies join the cluster holding their parent persona.
  for (const d of discussions) {
    const c = clusters.find((cl) => cl.members.some((m) => m.id === d.parentAgentRunId));
    (c ?? clusters[clusters.length - 1])?.replies.push(d);
  }

  // Cluster geometry: compact grid, more columns as clusters grow so 100+
  // personas stay shallow and legible. Replies add rows below the personas.
  const geo = clusters.map((c) => {
    const n = Math.max(c.members.length, 1);
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const replyRows = Math.ceil(c.replies.length / cols);
    const width = Math.max(cols * CHIP_W + (cols - 1) * CHIP_GAP_X, HUB_W);
    return { cols, rows, replyRows, width };
  });

  const totalWidth =
    geo.reduce((sum, g) => sum + g.width, 0) + CLUSTER_GAP * Math.max(geo.length - 1, 0);
  const maxRows = Math.max(...geo.map((g) => g.rows + g.replyRows), 1);
  const hasReplies = discussions.length > 0;
  const bottomY =
    ROW_PERSONA_Y + maxRows * (CHIP_H + CHIP_GAP_Y) + (hasReplies ? REPLY_GAP : 0) + 100;

  const nodes: GraphAgentNode[] = [];
  const edges: Edge[] = [];
  const centerX = totalWidth / 2;

  const push = (agent: AgentLite, x: number, y: number) => {
    const { width, height } = dimsForKind(agent.kind);
    nodes.push({
      id: agent.id,
      type: "agent",
      position: { x, y },
      // Explicit dimensions (all nodes are fixed-size): lets React Flow render
      // and fit nodes immediately, without waiting for DOM measurement — vital
      // while agents stream in live.
      width,
      height,
      data: { agent, persona: agent.personaId ? (personas[agent.personaId] ?? null) : null },
      draggable: false,
      connectable: false,
      style: { width, height },
    });
  };

  const edge = (source: string, target: string, targetStatus: AgentLite["status"]) => {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: "smoothstep",
      animated: targetStatus === "running",
      style: {
        stroke: targetStatus === "failed" ? "var(--destructive)" : "var(--border)",
        strokeWidth: 1.25,
        opacity: targetStatus === "pending" ? 0.45 : 1,
      },
    });
  };

  for (const f of framing) push(f, centerX - HUB_W / 2, ROW_FRAMING_Y);
  const framingId = framing[0]?.id ?? null;

  // Planner + persona clusters, laid out left to right.
  let cursor = 0;
  clusters.forEach((c, i) => {
    const g = geo[i];
    const clusterCenter = cursor + g.width / 2;
    const planner = planners.find((p) => p.id === c.plannerId);
    if (planner) {
      push(planner, clusterCenter - HUB_W / 2, ROW_PLANNER_Y);
      if (framingId) edge(framingId, planner.id, planner.status);
    }
    c.members.forEach((m, j) => {
      const col = j % g.cols;
      const row = Math.floor(j / g.cols);
      const rowCount = Math.min(g.cols, c.members.length - row * g.cols);
      const rowWidth = rowCount * CHIP_W + (rowCount - 1) * CHIP_GAP_X;
      const x = clusterCenter - rowWidth / 2 + col * (CHIP_W + CHIP_GAP_X);
      const y = ROW_PERSONA_Y + row * (CHIP_H + CHIP_GAP_Y);
      push(m, x, y);
      if (planner) edge(planner.id, m.id, m.status);
    });

    // Focus-group replies: rows below the persona grid, tied to their persona.
    const replyBaseY = ROW_PERSONA_Y + g.rows * (CHIP_H + CHIP_GAP_Y) + REPLY_GAP;
    c.replies.forEach((d, j) => {
      const col = j % g.cols;
      const row = Math.floor(j / g.cols);
      const rowCount = Math.min(g.cols, c.replies.length - row * g.cols);
      const rowWidth = rowCount * CHIP_W + (rowCount - 1) * CHIP_GAP_X;
      const x = clusterCenter - rowWidth / 2 + col * (CHIP_W + CHIP_GAP_X);
      const y = replyBaseY + row * (CHIP_H + CHIP_GAP_Y);
      push(d, x, y);
      if (d.parentAgentRunId) edge(d.parentAgentRunId, d.id, d.status);
      // The interaction web: dashed edges from every peer this reply heard,
      // drawn only for the selected reply so the graph stays legible.
      if (selectedId === d.id) {
        for (const peerId of heardIds(d)) {
          edges.push({
            id: `${peerId}~>${d.id}`,
            source: peerId,
            target: d.id,
            type: "smoothstep",
            animated: false,
            style: {
              stroke: "var(--primary)",
              strokeWidth: 1.25,
              strokeDasharray: "4 4",
              opacity: 0.8,
            },
          });
        }
      }
    });
    cursor += g.width + CLUSTER_GAP;
  });

  // Bottom row: critics flank synthesis.
  const bottomHubs = [...critiques.slice(0, 1), ...synthesis, ...critiques.slice(1)];
  const bottomWidth = bottomHubs.length * HUB_W + (bottomHubs.length - 1) * CLUSTER_GAP;
  bottomHubs.forEach((h, i) => {
    const x = centerX - bottomWidth / 2 + i * (HUB_W + CLUSTER_GAP);
    push(h, x, bottomY);
    if (framingId) edge(framingId, h.id, h.status);
  });

  return { nodes, edges };
}
