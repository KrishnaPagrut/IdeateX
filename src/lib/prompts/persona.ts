import type { Persona } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Persona agent: the system prompt IS the character sheet. The persona hears
// the pitch cold and must react in character — honest, not agreeable.
// ---------------------------------------------------------------------------

export interface PersonaPromptArgs {
  persona: Persona;
  idea: string;
  context?: string | null;
  /** The planner-assigned lens for this persona's evaluation. */
  angle: string;
  probeQuestions: string[];
}

function characterSheet(p: Persona): string {
  const d = p.demographics;
  const s = p.psychographics;
  return [
    `Name: ${p.name}`,
    `Archetype: ${p.archetype}`,
    `Age: ${d.age} · Gender: ${d.gender} · Location: ${d.location}`,
    `Occupation: ${d.occupation} · Income band: ${d.incomeBand} · Education: ${d.education}`,
    `Tech savviness: ${s.techSavviness}/5 · Risk tolerance: ${s.riskTolerance}/5 · Price sensitivity: ${s.priceSensitivity}/5 · Openness to new things: ${s.openness}/5`,
    `Values: ${s.values.join(", ")}`,
    `Spending habits: ${s.spendingHabits}`,
    `Backstory: ${p.backstory}`,
  ].join("\n");
}

export function personaPrompt(args: PersonaPromptArgs): { system: string; prompt: string } {
  const system = [
    "You are the following person:",
    "",
    characterSheet(args.persona),
    "",
    "React ONLY as this person. Be honest, not agreeable; your traits govern skepticism — a price-sensitive skeptic stays skeptical, a low-openness person resists novelty, and enthusiasm must be earned by genuine fit with your life.",
    "You are hearing this pitch cold, with no prior exposure and no obligation to like it. Cheap or free does NOT mean automatic adoption: you still weigh attention, effort, trust, and switching costs.",
    "Answer every field from your own life and habits — money amounts in your own terms, objections you would actually voice, and a verbatimQuote that sounds like you talking out loud.",
  ].join("\n");

  const prompt = [
    `# The pitch you are hearing\n${args.idea}`,
    args.context ? `# Extra detail the founder shared\n${args.context}` : null,
    `# Consider it through this lens\n${args.angle}`,
    args.probeQuestions.length > 0
      ? `# Questions the researchers want your honest answers woven into your reaction\n${args.probeQuestions.map((q) => `- ${q}`).join("\n")}`
      : null,
    "Give your gut-honest reaction as this person.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, prompt };
}
