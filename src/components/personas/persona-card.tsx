import Link from "next/link";

import type { Persona } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { PersonaAvatar } from "./persona-avatar";
import { PsychoDots } from "./psycho-dots";

export function PersonaCard({
  persona,
  showPool = true,
}: {
  persona: Persona;
  /** Hide the pool label when the surrounding view already states the pool. */
  showPool?: boolean;
}) {
  const d = persona.demographics;
  const p = persona.psychographics;
  const visibleTags = persona.tags.slice(0, 4);
  const moreTags = persona.tags.length - visibleTags.length;

  return (
    <Link
      href={`/personas/${persona.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 outline-none transition-colors hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <PersonaAvatar seed={persona.avatarSeed} name={persona.name} size={40} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {persona.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">
            {d.age} · {d.occupation} · {d.location}
          </p>
          <Badge variant="outline" className="mt-1.5 max-w-full">
            <span className="truncate">{persona.archetype}</span>
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border/70 pt-3">
        <PsychoDots label="Price sens." value={p.priceSensitivity} />
        <PsychoDots label="Tech" value={p.techSavviness} />
        <PsychoDots label="Openness" value={p.openness} />
      </div>

      {(persona.tags.length > 0 || showPool) && (
        <div className="flex flex-col gap-1.5">
          {persona.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {visibleTags.map((t) => (
                <Badge key={t} variant="secondary" className="max-w-full font-mono text-3xs">
                  <span className="truncate">{t}</span>
                </Badge>
              ))}
              {moreTags > 0 && (
                <span className="self-center font-mono text-3xs text-muted-foreground/80">
                  +{moreTags}
                </span>
              )}
            </div>
          )}
          {showPool && (
            <p className="truncate font-mono text-3xs tracking-wide text-muted-foreground/70">
              {persona.domain}/{persona.subdomain}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
