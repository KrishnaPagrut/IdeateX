"use client";

import { useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  useEdgesState,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AgentNode, type AgentNodeType } from "./agent-node";
import { buildGraph } from "./build-graph";
import type { AgentLite, PersonaLite } from "./types";

export { buildGraph } from "./build-graph";

// ---------------------------------------------------------------------------
// React Flow shell around the pure layout in build-graph.ts.
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = { agent: AgentNode };

export interface AgentGraphProps {
  agents: AgentLite[];
  personas: Record<string, PersonaLite>;
  onSelect: (agentRunId: string) => void;
  /** Currently selected agent (drawn with a selection ring). */
  selectedId?: string | null;
  className?: string;
}

function FitOnGrowth({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  const domNode = useStore((s) => s.domNode);
  const nodesInitialized = useNodesInitialized();
  const fittedCount = useRef(-1);

  // Fit only once nodes are measured — fitting earlier is a no-op that leaves
  // the swarm clipped. `nodesInitialized` drops to false while new agents
  // stream in and flips true when they're measured, so each batch refits once.
  useEffect(() => {
    if (!nodesInitialized || count === fittedCount.current) return;
    fittedCount.current = count;
    const t = requestAnimationFrame(() => {
      void fitView({ padding: 0.14, duration: 350 });
    });
    return () => cancelAnimationFrame(t);
  }, [nodesInitialized, count, fitView]);

  // Keep the swarm framed when the canvas itself changes size — window
  // resizes, tab switches, container height changes. Without this the graph
  // holds a stale viewport and clips.
  useEffect(() => {
    if (!domNode) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        void fitView({ padding: 0.14, duration: 200 });
      });
    });
    observer.observe(domNode);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [domNode, fitView]);

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
    const graph = buildGraph(agents, personas, selectedId);
    for (const n of graph.nodes) n.selected = n.id === selectedId;
    setNodes((prev) => {
      // Preserve dimensions React Flow already measured so a sync never
      // flips existing nodes back to hidden/unmeasured.
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      return graph.nodes.map((n) => ({
        ...(n as AgentNodeType),
        measured: measured.get(n.id),
      }));
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
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.12}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.25} color="var(--border)" />
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
