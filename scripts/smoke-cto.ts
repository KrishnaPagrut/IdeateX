/**
 * Verifies the CTO pipeline: the graph analysis must find a real critical
 * path and real bottlenecks, and the findings must cite them.
 */
import { ai } from "../src/lib/ai";
import { analyseBuildPlan, buildArtifacts, deriveBuildFindings, generateBuildPlan } from "../src/lib/cto";
import { simulateSchedule } from "../src/lib/cto/montecarlo";
import type { Company } from "../src/lib/schemas";

const company: Company = {
  name: "Cadence",
  idea: "a scheduling tool that removes standup meetings for async engineering teams",
  url: "",
  stage: "idea",
  targetMarket: "remote-first engineering teams of 10-50",
  context: "two engineers, eight weeks, no budget for enterprise vendors",
};

(async () => {
  const plan = await generateBuildPlan(company, "ship a working MVP in 8 weeks", 42);
  const analysis = analyseBuildPlan(plan.tasks);
  const sim = simulateSchedule(plan.tasks, { runs: 4000, seed: 42, targetDays: analysis.criticalPathDays });
  const findings = deriveBuildFindings("demo", plan, analysis, sim);
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));

  console.log(`plan: ${plan.tasks.length} tasks | stack: ${plan.stack.join(", ")}`);
  console.log(`summary: ${plan.summary}\n`);

  const total = plan.tasks.reduce((s, t) => s + t.estimateDays, 0);
  console.log(`total work        ${total.toFixed(1)}d`);
  console.log(`critical path     ${analysis.criticalPathDays}d over ${analysis.criticalPath.length} tasks`);
  console.log(`  ${analysis.criticalPath.map((id) => byId.get(id)?.title ?? id).join("\n  → ")}`);
  console.log(`parallel floor    ${analysis.parallelFloorDays}d`);
  console.log(`expected slip     ${analysis.expectedSlipDays}d`);
  console.log(`cycles            ${analysis.cycles.length}`);

  console.log(`
MONTE CARLO (${sim.runs.toLocaleString()} runs)`);
  console.log(`  deterministic   ${sim.deterministic}d`);
  console.log(`  P10 / P50       ${sim.p10}d / ${sim.p50}d`);
  console.log(`  P80 / P95       ${sim.p80}d / ${sim.p95}d`);
  console.log(`  P(hit ${sim.deterministic}d)  ${Math.round((sim.targetProbability??0)*100)}%`);
  console.log(`  most critical   ${sim.criticality.slice(0,3).map(c=>`${(plan.tasks.find(t=>t.id===c.taskId)?.title??c.taskId).slice(0,26)} ${Math.round(c.share*100)}%`).join(" | ")}`);

  console.log("\nbottlenecks:");
  analysis.bottlenecks.forEach((b) =>
    console.log(`  ${byId.get(b.taskId)?.title.padEnd(34)} blocks ${b.blocksCount}  risk ${(b.risk * 100).toFixed(0)}%`),
  );

  console.log("\nfindings:");
  findings.findings.forEach((f) => {
    console.log(`  [${f.kind.padEnd(11)}] ${f.axis.padEnd(15)} ${f.headline}`);
    console.log(`       → ${f.directive.slice(0, 96)}`);
  });

  const artifacts = buildArtifacts(plan.tasks, analysis, "2026-09-01");
  const counts = artifacts.reduce<Record<string, number>>((m, a) => {
    m[a.kind] = (m[a.kind] ?? 0) + 1;
    return m;
  }, {});
  console.log(`\nartifacts: ${artifacts.length} —`, JSON.stringify(counts));

  // The analysis has to be doing real work, not returning trivia.
  const ok =
    analysis.criticalPath.length >= 3 &&
    analysis.criticalPathDays > 0 &&
    analysis.criticalPathDays < total &&
    analysis.bottlenecks.length >= 1 &&
    findings.findings.length >= 4 &&
    artifacts.length > plan.tasks.length &&
    sim.p80 > sim.p50 &&
    sim.p50 >= sim.deterministic * 0.9;

  console.log("\n=== analysis is non-trivial:", ok);
  if (!ok) process.exit(1);
  console.log("CTO SMOKE PASS");
})().catch((e) => {
  console.error("CTO SMOKE FAIL:", e);
  process.exit(1);
});
