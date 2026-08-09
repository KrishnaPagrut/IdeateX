/**
 * CTO pipeline persistence: plan → analyse → findings → draft artifacts.
 * Mirrors the CMO's `generateTimeline`, writing into the same items table so
 * both roles share version history, approvals, and the artifact board.
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashSeed } from "../ai/rng";
import { db, schema } from "../db";
import type { BuildAnalysis, BuildPlanDesign, Company, FindingsReport } from "../schemas";
import { analyseBuildPlan, buildArtifacts, deriveBuildFindings, generateBuildPlan } from "./index";
import { simulateSchedule, type ScheduleSimulation } from "./montecarlo";

export type BuildPlanRecord = {
  plan: BuildPlanDesign;
  analysis: BuildAnalysis;
  /** Monte Carlo over the dependency graph — the CTO's simulation. */
  simulation: ScheduleSimulation;
  findings: FindingsReport;
};

export async function runCto(
  companyId: string,
  company: Company,
  objective: string,
): Promise<BuildPlanRecord> {
  const seed = hashSeed(`${companyId}:cto:${objective}`);

  const plan = await generateBuildPlan(company, objective, seed);
  const analysis = analyseBuildPlan(plan.tasks);

  // Simulate the schedule before drawing any conclusions from it. The target
  // is the deterministic critical path — i.e. "what are the odds we hit the
  // number we'd naively have quoted?"
  const simulation = simulateSchedule(plan.tasks, {
    runs: 4000,
    seed,
    targetDays: analysis.criticalPathDays,
  });

  const findings = deriveBuildFindings(companyId, plan, analysis, simulation);

  const record: BuildPlanRecord = { plan, analysis, simulation, findings };

  db.update(schema.campaigns)
    .set({ buildPlan: JSON.stringify(record), objective, status: "cto_ready" })
    .where(eq(schema.campaigns.id, companyId))
    .run();

  // Draft artifacts, scheduled from today along the critical path.
  const startDate = new Date().toISOString().slice(0, 10);
  const drafts = buildArtifacts(plan.tasks, analysis, startDate);

  // Replace this company's previous CTO artifacts. Scoped by BOTH company and
  // role: without the company filter this would wipe every other company's
  // plan, and without the role filter it would wipe the CMO's assets.
  db.delete(schema.campaignItems)
    .where(and(eq(schema.campaignItems.campaignId, companyId), eq(schema.campaignItems.role, "cto")))
    .run();

  if (drafts.length) {
    db.insert(schema.campaignItems)
      .values(
        drafts.map((d, i) => ({
          id: nanoid(10),
          campaignId: companyId,
          kind: d.kind,
          role: "cto",
          state: "draft" as const,
          title: d.title,
          body: d.body,
          scheduledAt: d.scheduledAt,
          platform: "web",
          targetCohortIds: "[]",
          purpose: d.purpose,
          callToAction: null,
          hashtags: JSON.stringify([d.area]),
          imagePrompt: null,
          imageUrl: null,
          imageVariants: "[]",
          form: null,
          linkedItemIds: JSON.stringify([d.taskId]),
          version: 0,
          sortOrder: i,
        })),
      )
      .run();
  }

  return record;
}

export function getBuildPlan(companyId: string): BuildPlanRecord | null {
  const row = db
    .select({ buildPlan: schema.campaigns.buildPlan })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, companyId))
    .get();
  if (!row?.buildPlan) return null;
  try {
    return JSON.parse(row.buildPlan) as BuildPlanRecord;
  } catch {
    return null;
  }
}
