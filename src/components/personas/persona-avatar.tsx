import { cn } from "@/lib/utils";

/**
 * Deterministic identicon: a tinted disc + initials, derived entirely from the
 * persona's avatarSeed. Self-contained inline SVG — no network, no deps.
 * Single mid-lightness hue via currentColor so it reads on light and dark.
 */

function hashSeed(seed: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const h = hashSeed(seed);
  const hue = h % 360;
  const sat = 42 + ((h >>> 9) % 24); // 42–65%
  const light = 42 + ((h >>> 17) % 10); // 42–51%
  const color = `hsl(${hue} ${sat}% ${light}%)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`Avatar for ${name}`}
      className={cn("shrink-0", className)}
      style={{ color }}
    >
      <circle cx="20" cy="20" r="19" fill="currentColor" opacity="0.14" />
      <circle
        cx="20"
        cy="20"
        r="18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
      />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize="14"
        fontWeight="600"
        fontFamily="var(--font-geist-mono), monospace"
        letterSpacing="0.5"
      >
        {initialsOf(name)}
      </text>
    </svg>
  );
}
