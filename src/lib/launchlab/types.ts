/**
 * Types for the remaining LaunchLab algorithms (build planning / Monte Carlo
 * schedule simulation — not yet wired into a run stage).
 *
 * The social-simulation types that used to live here graduated to
 * `src/lib/schemas/marketing.ts` when the sim was ported to
 * `src/lib/engine/social/sim.ts`.
 */
import { z } from "zod";

const Trait = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Build planning — inputs to the Monte Carlo schedule simulation
// ---------------------------------------------------------------------------

export const EngTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  area: z.enum([
    "infra",
    "backend",
    "frontend",
    "data",
    "auth",
    "integration",
    "testing",
    "ops",
  ]),
  /** Rough size in days. Weights the critical path. */
  estimateDays: z.number().min(0.5).max(30),
  /** Ids of tasks that must land before this one can start. */
  dependsOn: z.array(z.string()),
  /** 0-1 chance this task overruns, judged from its unknowns. */
  risk: Trait,
  riskReason: z.string(),
});
export type EngTask = z.infer<typeof EngTaskSchema>;

/** Derived from the task graph in code — never asked of a model. */
export const BuildAnalysisSchema = z.object({
  criticalPath: z.array(z.string()),
  criticalPathDays: z.number(),
  parallelFloorDays: z.number(),
  bottlenecks: z.array(
    z.object({ taskId: z.string(), blocksCount: z.number(), risk: Trait }),
  ),
  cycles: z.array(z.array(z.string())),
  expectedSlipDays: z.number(),
});
export type BuildAnalysis = z.infer<typeof BuildAnalysisSchema>;
