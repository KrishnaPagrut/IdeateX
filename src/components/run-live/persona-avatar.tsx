/**
 * Deterministic persona avatar: a seeded 5x5 mirrored identicon on a hue
 * derived from the avatarSeed. Pure inline SVG — no network, no services.
 * The hue is data (identity), not theme, so it is computed, not tokenized;
 * lightness/chroma are fixed so marks stay legible on light and dark surfaces.
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

interface AvatarSpec {
  hue: number;
  cells: boolean[]; // 5x5 row-major
}

function specFromSeed(seed: string): AvatarSpec {
  const h = hashSeed(seed);
  const hue = h % 360;
  // 15 bits drive the left 3 columns of 5 rows; right 2 columns mirror.
  let bits = hashSeed(seed + "#cells");
  const cells: boolean[] = new Array(25).fill(false);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const on = (bits & 1) === 1;
      bits >>>= 1;
      cells[row * 5 + col] = on;
      cells[row * 5 + (4 - col)] = on;
    }
  }
  // Guarantee a visible mark
  if (!cells.some(Boolean)) cells[12] = true;
  return { hue, cells };
}

export function PersonaAvatar({
  seed,
  size = 24,
  className,
  label,
}: {
  seed: string;
  size?: number;
  className?: string;
  /** Accessible name; falls back to a seed-based label. */
  label?: string;
}) {
  const { hue, cells } = specFromSeed(seed);
  const bg = `oklch(0.93 0.045 ${hue})`;
  const fg = `oklch(0.45 0.13 ${hue})`;
  const cell = 10; // viewBox units
  const pad = 5;
  return (
    <svg
      viewBox="0 0 60 60"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `Avatar for seed ${seed}`}
      className={className}
      style={{ borderRadius: "50%", flexShrink: 0 }}
    >
      <rect width="60" height="60" fill={bg} />
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={pad + (i % 5) * cell}
            y={pad + Math.floor(i / 5) * cell}
            width={cell}
            height={cell}
            fill={fg}
          />
        ) : null,
      )}
    </svg>
  );
}
