import type { Persona } from "@/lib/db/schema";
import type { Brief } from "@/lib/schemas/brief";

// ---------------------------------------------------------------------------
// Casting planner: picks the most representative sample of the persona
// library for its assigned segment, including at least one likely detractor.
// Receives the full persona index in the pinned one-line format.
// ---------------------------------------------------------------------------

/** `id · name · archetype · age/occupation/location · one-line psychographics` */
export function formatPersonaIndexLine(p: Persona): string {
  const d = p.demographics;
  const s = p.psychographics;
  const psycho = `tech ${s.techSavviness}/5, risk ${s.riskTolerance}/5, price-sensitivity ${s.priceSensitivity}/5, openness ${s.openness}/5, values ${s.values.slice(0, 3).join("+")}`;
  return `${p.id} · ${p.name} · ${p.archetype} · ${d.age}/${d.occupation}/${d.location} · ${psycho}`;
}

export function formatPersonaIndex(personas: Persona[]): string {
  return personas.map(formatPersonaIndexLine).join("\n");
}

export interface PlannerPromptArgs {
  brief: Brief;
  segment: { name: string; description: string; whyRelevant: string };
  personaIndex: string;
  /** Exact number of picks to make. */
  budget: number;
}

export function plannerPrompt(args: PlannerPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are a casting director for a market-research study. From a fixed persona library, you select the sample of people whose reactions will best represent your assigned segment.",
    "Selection rules:",
    `- Pick EXACTLY ${args.budget} personas, all from the provided index. The personaId of every pick MUST be copied verbatim from the index — never invent or alter ids.`,
    "- Optimize for REPRESENTATIVENESS of the segment, not for enthusiasm: cover the segment's internal diversity (age, income, tech comfort, attitudes).",
    "- Include at least one likely DETRACTOR — someone whose traits predict skepticism or rejection — so the study cannot become an echo chamber.",
    "- For each pick, set `angle`: the specific lens this persona should evaluate the idea through (grounded in their life, not generic).",
    "- For each pick, write up to 3 probeQuestions that pressure-test the study's key assumptions and risk dimensions from this persona's perspective.",
  ].join("\n");

  const prompt = [
    `# Study brief\nIdea: ${args.brief.ideaSummary}\nTarget market: ${args.brief.targetMarket}\nKey assumptions: ${args.brief.keyAssumptions.join("; ")}\nRisk dimensions: ${args.brief.riskDimensions.join("; ")}`,
    `# Your assigned segment\n${args.segment.name}: ${args.segment.description}\nWhy it matters: ${args.segment.whyRelevant}`,
    `# Persona index (id · name · archetype · age/occupation/location · psychographics)\n${args.personaIndex}`,
    `Cast your sample now: exactly ${args.budget} picks for segment "${args.segment.name}".`,
  ].join("\n\n");

  return { system, prompt };
}

/** Appended for the single re-ask when a plan referenced ids not in the index. */
export function plannerInvalidIdsRetrySuffix(invalidIds: string[]): string {
  return [
    "",
    `Your previous plan referenced personaIds that do NOT exist in the index: ${invalidIds.join(", ")}.`,
    "Re-issue the complete casting plan using ONLY personaIds copied verbatim from the index above.",
  ].join("\n");
}
