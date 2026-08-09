import { z } from "zod";

/**
 * A persona's focus-group response after hearing segment peers' verdicts.
 * Stored as the `output` of a kind='discussion' agent_run whose
 * parent_agent_run_id is the persona's ORIGINAL simulation agent_run; the
 * peers it responded to are recorded in `heardAgentRunIds` (interaction edges
 * for the graph).
 */
export const DiscussionSchema = z.object({
  reaction: z
    .string()
    .describe("First-person, in-character response to what the peers said"),
  updatedAdoptionLikelihood: z
    .number()
    .min(0)
    .max(100)
    .describe("Adoption likelihood after hearing the group; may equal the original"),
  changedMind: z.boolean().describe("True when the group discussion moved this persona's stance"),
  agreesWith: z.array(z.string()).max(3).describe("Names of peers this persona sided with"),
  disagreesWith: z.array(z.string()).max(3).describe("Names of peers this persona pushed back on"),
  keyPointHeard: z
    .string()
    .describe("The single peer argument that most affected (or failed to move) this persona"),
});

export type Discussion = z.infer<typeof DiscussionSchema>;

/** Wire shape of a discussion agent_run's output column. */
export interface DiscussionOutput extends Discussion {
  /** agent_run ids of the peer persona runs whose verdicts this persona heard. */
  heardAgentRunIds: string[];
}
