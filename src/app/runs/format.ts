import type { RunStatus } from "@/lib/db/schema";
import type { SYNTHESIS_VERDICTS } from "@/lib/schemas/synthesis";

// Display helpers shared by the run history table and the live run shell.

export type SynthesisVerdict = (typeof SYNTHESIS_VERDICTS)[number];

export const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "pending",
  "framing",
  "planning",
  "strategizing",
  "racing",
  "advising",
  "simulating",
  "discussing",
  "critiquing",
  "synthesizing",
]);

export function isActiveStatus(status: RunStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Pending",
  framing: "Framing",
  planning: "Planning",
  strategizing: "Strategy",
  racing: "Racing",
  advising: "Advising",
  simulating: "Simulating",
  discussing: "Focus group",
  critiquing: "Critiquing",
  synthesizing: "Synthesizing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  stale: "Stale",
};

/** Badge classes per run status — accent for live/complete, semantic for the rest. */
export function statusBadgeClass(status: RunStatus): string {
  if (status === "completed") return "border-transparent bg-primary/10 text-primary";
  if (status === "failed") return "border-transparent bg-destructive/10 text-destructive";
  if (status === "cancelled" || status === "stale")
    return "border-transparent bg-muted text-muted-foreground";
  return "border-primary/30 bg-primary/5 text-primary"; // pending + live stages
}

export const VERDICT_LABELS: Record<SynthesisVerdict, string> = {
  strong_signal: "Strong signal",
  promising: "Promising",
  mixed: "Mixed",
  weak: "Weak",
  dead_on_arrival: "Dead on arrival",
};

export function verdictBadgeClass(verdict: SynthesisVerdict): string {
  switch (verdict) {
    case "strong_signal":
    case "promising":
      return "border-transparent bg-primary/10 text-primary";
    case "mixed":
      return "border-transparent bg-secondary text-secondary-foreground";
    case "weak":
    case "dead_on_arrival":
      return "border-transparent bg-destructive/10 text-destructive";
  }
}

/** Pulls the verdict out of a runs.synthesis jsonb blob, defensively. */
export function verdictFromSynthesis(synthesis: unknown): SynthesisVerdict | null {
  if (synthesis && typeof synthesis === "object" && "verdict" in synthesis) {
    const value = (synthesis as { verdict?: unknown }).verdict;
    if (typeof value === "string") return value as SynthesisVerdict;
  }
  return null;
}

export function formatUsd(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const usd = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(usd)) return null;
  return `$${usd.toFixed(2)}`;
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
