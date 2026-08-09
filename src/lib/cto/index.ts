/**
 * The CTO role.
 *
 * Mirrors the CMO's shape exactly — gather evidence, analyse it, derive
 * findings with directives, then generate artifacts conditioned on those
 * findings. Here the "evidence" is a proposed build plan and the "analysis" is
 * the dependency graph, so a CTO finding ("auth blocks four downstream tasks
 * and carries the highest risk on the plan") is structurally identical to a
 * CMO finding and renders in the same UI.
 *
 * Nothing here touches a real repository. Artifacts are drafts.
 */
import { ai } from "../ai";
import {
  BuildPlanDesignSchema,
  type BuildAnalysis,
  type BuildPlanDesign,
  type Company,
  type EngTask,
  type Finding,
  type FindingsReport,
} from "../schemas";
import { analyseBuildPlan } from "./analysis";
import type { ScheduleSimulation } from "./montecarlo";

export { analyseBuildPlan };

export async function generateBuildPlan(
  company: Company,
  objective: string,
  seed: number,
): Promise<BuildPlanDesign> {
  return ai.structured(
    BuildPlanDesignSchema,
    [
      "You are a pragmatic CTO breaking an objective into an executable build plan.",
      "Produce 8-14 tasks. Task ids MUST be t_0, t_1, t_2 … in order.",
      "dependsOn must only reference ids that exist and must never form a cycle.",
      "Estimates are in days and should be realistic for a small team.",
      "risk is 0-1: how likely this task overruns because of unknowns, third-party",
      "dependencies, or unclear requirements. Be honest — a plan where everything",
      "is low risk is a plan nobody believes.",
    ].join(" "),
    [
      `Company: ${company.name}`,
      `Idea: ${company.idea}`,
      `Stage: ${company.stage}`,
      `Target market: ${company.targetMarket}`,
      company.context ? `Constraints: ${company.context}` : "",
      "",
      `OBJECTIVE: ${objective}`,
    ]
      .filter(Boolean)
      .join("\n"),
    { task: "buildplan", seed, context: { company, objective } },
  );
}

/**
 * Turn the graph analysis into findings. Computed from the numbers, not
 * generated — every finding cites a task id and a measured quantity.
 */
export function deriveBuildFindings(
  companyId: string,
  plan: BuildPlanDesign,
  analysis: BuildAnalysis,
  sim: ScheduleSimulation,
): FindingsReport {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const name = (id: string) => byId.get(id)?.title ?? id;

  const findings: Finding[] = [];
  const push = (f: Omit<Finding, "id">) => findings.push({ id: `fd_${findings.length}`, ...f });

  const totalDays = plan.tasks.reduce((s, t) => s + t.estimateDays, 0);

  // The headline finding is the simulation's, not the point estimate's.
  const pct = Math.round((sim.targetProbability ?? 0) * 100);
  push({
    kind: pct < 40 ? "risk" : "worked",
    headline: `${pct}% chance of hitting ${sim.deterministic} days`,
    detail: `Across ${sim.runs.toLocaleString()} simulated runs the plan finishes at P50 ${sim.p50}d, P80 ${sim.p80}d, P95 ${sim.p95}d. The naive critical path of ${sim.deterministic}d assumes every task hits its estimate — which happened in ${pct}% of runs.`,
    cohortIds: [],
    axis: "scopeRisk",
    weight: 1,
    evidenceEventIds: [],
    directive: `Commit to ${Math.ceil(sim.p80)} days (P80), not ${Math.ceil(sim.deterministic)}. Hold ${Math.ceil(sim.p95 - sim.p50)} days of buffer for the tail.`,
  });

  // Tasks that are critical in most runs — real risk, as opposed to tasks that
  // only look critical under the single deterministic pass.
  const persistent = sim.criticality.filter((c) => c.share >= 0.5);
  if (persistent.length) {
    push({
      kind: "risk",
      headline: `${persistent.length} task${persistent.length === 1 ? "" : "s"} sit on the critical path in most runs`,
      detail: persistent
        .slice(0, 3)
        .map((c) => `${name(c.taskId)} (${Math.round(c.share * 100)}%)`)
        .join(", ") + ". These determine the finish date regardless of how the rest goes.",
      cohortIds: [],
      axis: "criticalPath",
      weight: 0.95,
      evidenceEventIds: persistent.map((c) => c.taskId),
      directive: `Protect ${name(persistent[0].taskId)} above everything else — it is on the critical path in ${Math.round(persistent[0].share * 100)}% of simulated runs.`,
    });
  }

  push({
    kind: "worked",
    headline: `Critical path is ${analysis.criticalPathDays} days across ${analysis.criticalPath.length} tasks`,
    detail: `Sequential chain: ${analysis.criticalPath.map(name).join(" → ")}. Total estimated work is ${totalDays.toFixed(1)} days, so ${(totalDays - analysis.criticalPathDays).toFixed(1)} days can run in parallel.`,
    cohortIds: [],
    axis: "criticalPath",
    weight: 1,
    evidenceEventIds: analysis.criticalPath,
    directive: `Staff the critical path first: ${analysis.criticalPath.slice(0, 3).map(name).join(", ")}. Everything else is schedulable around it.`,
  });

  analysis.bottlenecks.slice(0, 2).forEach((b) => {
    const task = byId.get(b.taskId);
    if (!task) return;
    push({
      kind: b.risk >= 0.5 ? "risk" : "opportunity",
      headline: `"${task.title}" blocks ${b.blocksCount} downstream task${b.blocksCount === 1 ? "" : "s"}`,
      detail: `Risk ${(b.risk * 100).toFixed(0)}% — ${task.riskReason} A slip here propagates to ${b.blocksCount} other tasks.`,
      cohortIds: [],
      axis: "dependencyRisk",
      weight: Math.min(1, 0.4 + b.blocksCount / 10 + b.risk / 3),
      evidenceEventIds: [b.taskId],
      directive:
        b.risk >= 0.5
          ? `De-risk "${task.title}" with a timeboxed spike before committing the downstream schedule.`
          : `Start "${task.title}" early — it gates more work than its size suggests.`,
    });
  });

  const riskiest = [...plan.tasks].sort((a, b) => b.risk * b.estimateDays - a.risk * a.estimateDays)[0];
  if (riskiest && riskiest.risk >= 0.4) {
    push({
      kind: "risk",
      headline: `"${riskiest.title}" carries the largest expected slip`,
      detail: `${riskiest.estimateDays}d estimate at ${(riskiest.risk * 100).toFixed(0)}% risk. ${riskiest.riskReason}`,
      cohortIds: [],
      axis: "scopeRisk",
      weight: 0.8,
      evidenceEventIds: [riskiest.id],
      directive: `Split "${riskiest.title}" into a spike plus an implementation task so the unknown is resolved separately from the build.`,
    });
  }

  const parallelisable = plan.tasks.filter((t) => !t.dependsOn.length).length;
  if (parallelisable >= 2) {
    push({
      kind: "opportunity",
      headline: `${parallelisable} tasks have no dependencies`,
      detail: `They can start immediately and in parallel. The theoretical floor with unlimited people is ${analysis.parallelFloorDays} days.`,
      cohortIds: [],
      axis: "parallelism",
      weight: 0.6,
      evidenceEventIds: plan.tasks.filter((t) => !t.dependsOn.length).map((t) => t.id),
      directive: "Front-load the dependency-free tasks so nobody idles waiting on the critical path.",
    });
  }

  if (analysis.cycles.length) {
    push({
      kind: "failed",
      headline: `Dependency cycle detected`,
      detail: `${analysis.cycles.map((c) => c.map(name).join(" → ")).join("; ")}. The plan cannot be scheduled as written.`,
      cohortIds: [],
      axis: "dependencyRisk",
      weight: 1,
      evidenceEventIds: analysis.cycles.flat(),
      directive: "Break the cycle by splitting one task into an interface-first stub and a follow-up implementation.",
    });
  }

  plan.openQuestions.slice(0, 2).forEach((q) => {
    push({
      kind: "opportunity",
      headline: `Open question: ${q.length > 70 ? q.slice(0, 70) + "…" : q}`,
      detail: "Unresolved before the plan can be committed to a date.",
      cohortIds: [],
      axis: "unknowns",
      weight: 0.5,
      evidenceEventIds: [],
      directive: `Resolve "${q.slice(0, 60)}" with a spike before sequencing dependent work.`,
    });
  });

  return {
    campaignId: companyId,
    winningStrategyId: "build_plan",
    whyItWon: `${plan.tasks.length} tasks simulated ${sim.runs.toLocaleString()} times. P50 ${sim.p50}d · P80 ${sim.p80}d · P95 ${sim.p95}d against a naive critical path of ${sim.deterministic}d. ${plan.summary}`,
    findings,
    carryOver: plan.stack.length ? [`Proposed stack: ${plan.stack.join(", ")}`] : [],
  };
}

/** Turns tasks into draft artifacts. Nothing is pushed anywhere. */
export function buildArtifacts(
  tasks: EngTask[],
  analysis: BuildAnalysis,
  startDate: string,
): Array<{
  kind: "eng_task" | "pr_draft" | "spike";
  title: string;
  body: string;
  scheduledAt: string;
  purpose: string;
  area: string;
  taskId: string;
}> {
  const onCritical = new Set(analysis.criticalPath);
  const start = new Date(`${startDate}T09:00:00Z`);

  // Schedule along the critical path first, then everything else.
  const ordered = [...tasks].sort((a, b) => {
    const aCrit = onCritical.has(a.id) ? 0 : 1;
    const bCrit = onCritical.has(b.id) ? 0 : 1;
    return aCrit - bCrit || b.risk - a.risk;
  });

  let cursorDays = 0;
  return ordered.flatMap((t) => {
    const at = new Date(start);
    at.setUTCDate(at.getUTCDate() + Math.round(cursorDays));
    cursorDays += Math.max(1, t.estimateDays * 0.5);

    const critical = onCritical.has(t.id);
    const purpose = critical
      ? `On the critical path — ${analysis.criticalPathDays}d chain depends on this landing on time.`
      : `Parallelisable. Risk ${(t.risk * 100).toFixed(0)}%: ${t.riskReason}`;

    const deps = t.dependsOn.length
      ? t.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title ?? d).join(", ")
      : "none";

    const items: ReturnType<typeof buildArtifacts> = [
      {
        kind: "eng_task",
        title: t.title,
        body: `${t.description}\n\nArea: ${t.area}\nEstimate: ${t.estimateDays}d\nDepends on: ${deps}\nRisk: ${(t.risk * 100).toFixed(0)}% — ${t.riskReason}`,
        scheduledAt: at.toISOString(),
        purpose,
        area: t.area,
        taskId: t.id,
      },
    ];

    // High-risk work gets a spike to resolve the unknown separately.
    if (t.risk >= 0.55) {
      const spikeAt = new Date(at);
      spikeAt.setUTCDate(spikeAt.getUTCDate() - 1);
      items.unshift({
        kind: "spike",
        title: `Spike: de-risk ${t.title}`,
        body: `Timeboxed investigation before committing to "${t.title}".\n\nUnknown: ${t.riskReason}\n\nExit criteria: a written answer that lets us estimate the implementation to ±1 day.`,
        scheduledAt: spikeAt.toISOString(),
        purpose: `Risk on this task is ${(t.risk * 100).toFixed(0)}%; resolving it first protects the schedule.`,
        area: t.area,
        taskId: t.id,
      });
    }

    // A PR draft for the substantial pieces.
    if (t.estimateDays >= 2) {
      const prAt = new Date(at);
      prAt.setUTCHours(prAt.getUTCHours() + 4);
      items.push({
        kind: "pr_draft",
        title: `PR: ${t.title}`,
        body: [
          `## What`,
          t.description,
          "",
          `## Why`,
          purpose,
          "",
          `## Scope`,
          `- Area: ${t.area}`,
          `- Blocked by: ${deps}`,
          "",
          `## Checklist`,
          `- [ ] Implementation`,
          `- [ ] Tests covering the ${t.area} path`,
          `- [ ] Docs updated`,
          t.risk >= 0.55 ? `- [ ] Spike findings folded in` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        scheduledAt: prAt.toISOString(),
        purpose: "Draft only — not opened against any repository.",
        area: t.area,
        taskId: t.id,
      });
    }

    return items;
  });
}
