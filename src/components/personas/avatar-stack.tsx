import { cn } from "@/lib/utils";
import { PersonaAvatar } from "./persona-avatar";

/** Overlapping identicon stack — a glimpse of who actually lives in a pool. */
export function AvatarStack({
  members,
  size = 24,
  className,
}: {
  members: Array<{ id: string; name: string; avatarSeed: string }>;
  size?: number;
  className?: string;
}) {
  if (members.length === 0) return null;
  return (
    <span className={cn("inline-flex items-center", className)} aria-hidden="true">
      {members.slice(0, 5).map((m, i) => (
        <span
          key={m.id}
          className={cn("rounded-full bg-card ring-2 ring-card", i > 0 && "-ml-2")}
        >
          <PersonaAvatar seed={m.avatarSeed} name={m.name} size={size} />
        </span>
      ))}
    </span>
  );
}
