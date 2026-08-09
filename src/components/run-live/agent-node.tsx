"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Crosshair,
  Gavel,
  Lightbulb,
  ListChecks,
  MessageCircleReply,
  MessagesSquare,
  ShieldAlert,
  FlaskConical,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AgentKind, AgentStatus } from "@/lib/db/schema";
import type { AgentLite, PersonaLite } from "./types";
import { PersonaAvatar } from "./persona-avatar";

export type AgentNodeType = Node<
  {
    agent: AgentLite;
    persona: PersonaLite | null;
  },
  "agent"
>;

const KIND_ICON: Record<Exclude<AgentKind, "persona">, typeof Crosshair> = {
  framing: Crosshair,
  planner: ListChecks,
  strategy: Lightbulb,
  reaction: MessageCircleReply,
  advisor: UserCheck,
  moderator: Gavel,
  discussion: MessagesSquare,
  critique: ShieldAlert,
  synthesis: FlaskConical,
};

const KIND_EYEBROW: Record<AgentKind, string> = {
  framing: "framing",
  planner: "planner",
  strategy: "strategist",
  reaction: "reaction",
  advisor: "advisor",
  moderator: "moderator",
  persona: "persona",
  discussion: "focus group",
  critique: "critic",
  synthesis: "synthesis",
};

function statusClasses(status: AgentStatus): string {
  switch (status) {
    case "running":
      // The halo utility breathes a soft primary ring; no extra element needed.
      return "halo-running border-primary";
    case "completed":
      return "border-border";
    case "failed":
      return "border-destructive/60 bg-destructive/5";
    case "skipped":
      return "border-dashed border-border opacity-50";
    default:
      return "border-dashed border-border opacity-60"; // pending
  }
}

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      aria-label={status}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "completed" && "bg-primary",
        status === "running" && "breathe bg-primary",
        status === "failed" && "bg-destructive",
        (status === "pending" || status === "skipped") && "bg-muted-foreground/40",
      )}
    />
  );
}

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const { agent, persona } = data;
  const isPersona = agent.kind === "persona";
  const running = agent.status === "running";
  const failed = agent.status === "failed";

  const handles = (
    <>
      <Handle type="target" position={Position.Top} className="pointer-events-none! size-px! min-h-0! min-w-0! border-0! bg-transparent!" />
      <Handle type="source" position={Position.Bottom} className="pointer-events-none! size-px! min-h-0! min-w-0! border-0! bg-transparent!" />
    </>
  );

  if (isPersona) {
    return (
      <div
        className={cn(
          "rise-in relative flex h-9 w-[132px] cursor-pointer items-center gap-1.5 rounded-md border bg-card px-1.5 transition-colors",
          statusClasses(agent.status),
          selected && "ring-2 ring-ring/60",
        )}
      >
        {persona ? (
          <PersonaAvatar seed={persona.avatarSeed} size={20} />
        ) : (
          <span className="size-5 shrink-0 rounded-full bg-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-3xs leading-tight font-medium text-card-foreground">
            {persona?.name ?? agent.label}
          </span>
          <span className="block truncate font-mono text-[8px] leading-tight tracking-wide text-muted-foreground uppercase">
            {failed ? "failed" : (persona?.archetype ?? KIND_EYEBROW[agent.kind])}
          </span>
        </span>
        {failed ? (
          <TriangleAlert className="size-3 shrink-0 text-destructive" />
        ) : (
          <StatusDot status={agent.status} />
        )}
        {handles}
      </div>
    );
  }

  const Icon = KIND_ICON[agent.kind as Exclude<AgentKind, "persona">] ?? Crosshair;

  return (
    <div
      className={cn(
        "rise-in relative flex h-12 w-[176px] cursor-pointer items-center gap-2.5 rounded-md border bg-card px-3 transition-colors",
        statusClasses(agent.status),
        selected && "ring-2 ring-ring/60",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-sm",
          failed ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
          running && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[8px] tracking-eyebrow text-muted-foreground uppercase">
          {KIND_EYEBROW[agent.kind]}
        </span>
        <span className="block truncate text-xs font-medium text-card-foreground">
          {agent.kind === "planner" && agent.segment ? agent.segment : agent.label}
        </span>
      </span>
      {failed ? <TriangleAlert className="size-3.5 shrink-0 text-destructive" /> : <StatusDot status={agent.status} />}
      {handles}
    </div>
  );
});
