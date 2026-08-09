import type { Persona } from "@/lib/db";
import type { Verdict } from "@/lib/schemas/verdict";
import { characterSheet } from "./persona";

// ---------------------------------------------------------------------------
// Focus-group round: a persona hears segment peers' first reactions and
// responds in character. The point is social dynamics — agreement, pushback,
// genuine mind-changes — not consensus manufacturing.
// ---------------------------------------------------------------------------

export interface PeerTake {
  name: string;
  archetype: string;
  adoptionLikelihood: number;
  quote: string;
  topObjection: string | null;
}

export interface DiscussionPromptArgs {
  persona: Persona;
  idea: string;
  ownVerdict: Verdict;
  peers: PeerTake[];
}

export function discussionPrompt(args: DiscussionPromptArgs): { system: string; prompt: string } {
  const system = [
    characterSheet(args.persona),
    "",
    "You are this person in a moderated focus group. You have already given your",
    "private first reaction; now you hear what the others said. React ONLY as this",
    "person. Real people in groups are swayed sometimes — but only where their own",
    "traits, budget, and lived experience would actually bend. Do not converge for",
    "politeness; disagreement is valuable data. If a peer's point genuinely lands,",
    "say so and move your number; if it doesn't, push back and hold your number.",
  ].join("\n");

  const peerLines = args.peers
    .map(
      (p) =>
        `- ${p.name} (${p.archetype}, adoption ${p.adoptionLikelihood}/100): "${p.quote}"` +
        (p.topObjection ? ` Main objection: ${p.topObjection}` : ""),
    )
    .join("\n");

  const prompt = [
    `The idea under discussion: ${args.idea}`,
    "",
    `Your private first reaction was adoption ${args.ownVerdict.adoptionLikelihood}/100 — "${args.ownVerdict.verbatimQuote}"`,
    "",
    "What the others in your group said:",
    peerLines,
    "",
    "Respond in character: your spoken reaction to the group, whether anyone moved",
    "you (updatedAdoptionLikelihood may equal your original), who you side with or",
    "against by name, and the single peer point that most affected — or most",
    "failed to move — you.",
  ].join("\n");

  return { system, prompt };
}
