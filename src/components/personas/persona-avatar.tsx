import { PersonaAvatar as Identicon } from "@/components/run-live/persona-avatar";

/**
 * Persona avatar for library surfaces: the same seeded 5x5 identicon the
 * swarm graph uses, so a persona looks identical in a pool stack, the roster
 * grid, the detail page, and the live run. Adds a name-based accessible label.
 */
export function PersonaAvatar({
  seed,
  name,
  size = 40,
  className,
}: {
  seed: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return <Identicon seed={seed} size={size} className={className} label={`Avatar for ${name}`} />;
}
