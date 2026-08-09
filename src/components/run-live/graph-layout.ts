import type { AgentKind } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Shared swarm geometry. Layout math in agent-graph and the DOM boxes in
// agent-node MUST agree — a wider rendered node than its laid-out slot is
// what made focus-group reply chips overlap during generation.
// ---------------------------------------------------------------------------

export const HUB_W = 176;
export const HUB_H = 48;
export const CHIP_W = 148;
export const CHIP_H = 40;
export const CHIP_GAP_X = 16;
export const CHIP_GAP_Y = 14;
export const CLUSTER_GAP = 72;
export const REPLY_GAP = 28;
export const ROW_FRAMING_Y = 0;
export const ROW_PLANNER_Y = 140;
export const ROW_PERSONA_Y = 260;

/** Compact chips: personas + focus-group replies. Everything else is a hub. */
export function isChipKind(kind: AgentKind): boolean {
  return kind === "persona" || kind === "discussion";
}

export function dimsForKind(kind: AgentKind): { width: number; height: number } {
  return isChipKind(kind) ? { width: CHIP_W, height: CHIP_H } : { width: HUB_W, height: HUB_H };
}
