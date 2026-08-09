import { z } from "zod";

/** Output of the persona-library generation pipeline (seeder). */
export const GeneratedPersonaSchema = z.object({
  name: z.string().describe("Realistic full name"),
  archetype: z.string().describe("Short archetype label, e.g. 'Budget-conscious parent'"),
  demographics: z.object({
    age: z.number().min(16).max(90),
    gender: z.string(),
    location: z.string().describe("City, Country"),
    incomeBand: z.enum(["low", "lower_middle", "middle", "upper_middle", "high"]),
    education: z.string(),
    occupation: z.string(),
  }),
  psychographics: z.object({
    techSavviness: z.number().min(1).max(5),
    riskTolerance: z.number().min(1).max(5),
    priceSensitivity: z.number().min(1).max(5),
    openness: z.number().min(1).max(5),
    values: z.array(z.string()).min(2).max(4),
    spendingHabits: z.string(),
  }),
  backstory: z
    .string()
    .describe("A grounded paragraph: daily life, frustrations, media diet, decision style"),
  tags: z.array(z.string()).min(2).max(6),
});

export const GeneratedPersonaBatchSchema = z.object({
  personas: z.array(GeneratedPersonaSchema).min(1).max(20),
});

export type GeneratedPersona = z.infer<typeof GeneratedPersonaSchema>;

/** A pool definition distilled from a user's free-text population prompt. */
export const PoolSpecSchema = z.object({
  name: z.string().min(3).max(60).describe('Short pool name, e.g. "Risk-averse retirees"'),
  description: z
    .string()
    .min(20)
    .describe("One or two sentences: who these people are and how they buy"),
  seedHints: z
    .string()
    .min(10)
    .describe("Comma-separated kinds of people the pool must span, like taxonomy seedHints"),
});

export type PoolSpec = z.infer<typeof PoolSpecSchema>;
