"use client";

/**
 * Cytoscape audience network.
 *
 * Nodes are personas coloured by cohort; they light up as the simulation
 * reaches them. Layout is computed once and then frozen — re-running layout on
 * every tick makes the graph jitter and destroys the sense that you're
 * watching one population being progressively activated.
 */
import { useEffect, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";

export type GraphPersona = {
  id: string;
  handle: string;
  cohortId: string;
  influence: number;
};

export function AudienceGraph({
  personas,
  edges,
  cohortColors,
  activated,
  height = 340,
}: {
  personas: GraphPersona[];
  edges: Array<{ from: string; to: string; weight: number }>;
  cohortColors: Record<string, string>;
  activated: Set<string>;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Build once. Personas and edges don't change during a run.
  useEffect(() => {
    if (!ref.current || !personas.length) return;

    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...personas.map((p) => ({
          data: { id: p.id, label: p.handle, cohort: p.cohortId, influence: p.influence },
        })),
        // Cap edges — past a few hundred the layout cost dominates and the
        // picture turns into a hairball anyway.
        ...edges.slice(0, 320).map((e, i) => ({
          data: { id: `e${i}`, source: e.from, target: e.to, weight: e.weight },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": (el: any) => cohortColors[el.data("cohort")] ?? "#555",
            width: (el: any) => 8 + el.data("influence") * 16,
            height: (el: any) => 8 + el.data("influence") * 16,
            // Unreached personas sit faint; reaching them is the animation.
            opacity: 0.18,
            "border-width": 0,
            label: "",
          },
        },
        {
          selector: "node.on",
          style: {
            opacity: 1,
            "border-width": 1.5,
            "border-color": "#ffffff",
            "border-opacity": 1,
          },
        },
        {
          selector: "edge",
          style: {
            width: 0.5,
            "line-color": "#c9ced8",
            opacity: 0.5,
            "curve-style": "haystack",
          },
        },
      ],
      layout: { name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 45 } as any,
      userZoomingEnabled: false,
      userPanningEnabled: false,
      autoungrabify: true,
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [personas, edges, cohortColors]);

  // Only toggle classes on tick — cheap, and keeps positions stable.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const on = activated.has(n.id());
        if (on && !n.hasClass("on")) n.addClass("on");
        if (!on && n.hasClass("on")) n.removeClass("on");
      });
    });
  }, [activated]);

  return <div ref={ref} style={{ height }} className="w-full rounded-lg bg-[var(--panel-2)]" />;
}
