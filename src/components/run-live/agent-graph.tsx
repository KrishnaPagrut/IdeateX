"use client";

import { useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AgentNode, type AgentNodeType } from "./agent-node";
import type { AgentLite, PersonaLite } from "./types";

// ---------------------------------------------------------------------------
// Deterministic staged layout: framing on top, planners in a row, personas in
// a compact grid clustered under their planner, critics + synthesis at the
// bottom. No physics — positions are a pure function of the agent list, so the
// graph is stable while agents stream in.
// ---------------------------------------------------------------------------

const HUB_W = 176;
const HUB_H = 48;
const CHIP_W = 132;
const CHIP_H = 36;
const CHIP_GAP_X = 10;
const CHIP_GAP_Y = 10;
const CLUSTER_GAP = 56;
const ROW_FRAMING_Y = 0;
const ROW_PLANNER_Y = 130;
const ROW_PERSONA_Y = 240;

const nodeTypes: NodeTypes = { agent: AgentNode };

export interface AgentGraphProps {
  agents: AgentLite[];
  personas: Record<string, PersonaLite>;
  onSelect: (agentRunId: string) => void;
  /** Currently selected agent (drawn with a selection ring). */
  selectedId?: string | null;
  className?: string;
}

function buildGraph(agents: AgentLite[], personas: Record<string, PersonaLite>) {
  const framing = agents.filter((a) => a.kind === "framing");
  const planners = agents.filter((a) => a.kind === "planner");
  const personaAgents = agents.filter((a) => a.kind === "persona");
  const critiques = agents.filter((a) => a.kind === "critique");
  const synthesis = agents.filter((a) => a.kind === "synthesis");

  // Cluster personas by parent planner (preserving planner order); personas
  // with an unknown parent get a trailing cluster so nothing is dropped.
  const clusters: Array<{ plannerId: string | null; members: AgentLite[] }> = planners.map(
    (p) => ({ plannerId: p.id, members: [] }),
  );
  const orphans: AgentLite[] = [];
  for (const pa of personaAgents) {
    const c = clusters.find((cl) => cl.plannerId === pa.parentAgentRunId);
    if (c) c.members.push(pa);
    else orphans.push(pa);
  }
  if (orphans.length > 0) clusters.push({ plannerId: null, members: orphans });

  // Cluster geometry: compact grid, more columns as clusters grow so 100+
  // personas stay shallow and legible.
  const geo = clusters.map((c) => {
    const n = Math.max(c.members.length, 1);
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const width = Math.max(cols * CHIP_W + (cols - 1) * CHIP_GAP_X, HUB_W);
    return { cols, rows, width };
  });

  const totalWidth =
    geo.reduce((sum, g) => sum + g.width, 0) + CLUSTER_GAP * Math.max(geo.length - 1, 0);
  const maxRows = Math.max(...geo.map((g) => g.rows), 1);
  const bottomY = ROW_PERSONA_Y + maxRows * (CHIP_H + CHIP_GAP_Y) + 90;

  const nodes: AgentNodeType[] = [];
  const edges: Edge[] = [];
  const centerX = totalWidth / 2;

  const push = (agent: AgentLite, x: number, y: number) => {
    const hub = agent.kind !== "persona";
    nodes.push({
      id: agent.id,
      type: "agent",
      position: { x, y },
      // Explicit dimensions (all nodes are fixed-size): lets React Flow render
      // and fit nodes immediately, without waiting for DOM measurement — vital
      // while agents stream in live.
      width: hub ? HUB_W : CHIP_W,
      height: hub ? HUB_H : CHIP_H,
      data: { agent, persona: agent.personaId ? (personas[agent.personaId] ?? null) : null },
      draggable: false,
      connectable: false,
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

function FitOnGrowth({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  const prev = useRef(0);
  useEffect(() => {
    if (count !== prev.current) {
      prev.current = count;
      // Wait a frame so newly added nodes are measured before fitting.
      const t = requestAnimationFrame(() => {
        void fitView({ padding: 0.1, duration: 350 });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [count, fitView]);
  return null;
}

function AgentGraphInner({ agents, personas, onSelect, selectedId, className }: AgentGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync the derived layout into React Flow's node state. This must go through
  // setNodes/onNodesChange (not a fully-controlled memoized prop): React Flow
  // reports each new node's measured dimensions as a node change, and nodes
  // stay hidden until that change is applied — so agents streamed in after
  // mount would never render in a fully-controlled setup.
  useEffect(() => {
    const graph = buildGraph(agents, personas);
    for (const n of graph.nodes) n.selected = n.id === selectedId;
    setNodes((prev) => {
      // Preserve dimensions React Flow already measured so a sync never
      // flips existing nodes back to hidden/unmeasured.
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      return graph.nodes.map((n) => ({ ...n, measured: measured.get(n.id) }));
    });
    setEdges(graph.edges);
  }, [agents, personas, selectedId, setNodes, setEdges]);

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.15}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: false }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--border)" />
        <FitOnGrowth count={agents.length} />
      </ReactFlow>
    </div>
  );
}

export function AgentGraph(props: AgentGraphProps) {
  return (
    <ReactFlowProvider>
      <AgentGraphInner {...props} />
    </ReactFlowProvider>
  );
}
