import { cn } from "@/lib/utils";

/** Soft seeding target per pool — the taxonomy aims for ~20-30 people each. */
export const POOL_TARGET = 25;

/**
 * Dot-fill meter: one tiny dot per target slot in a pool (~25), filled in the
 * accent for each live persona. Extends the app's dot motif (identicons,
 * psycho-dots, dot-matrix loaders) with real state: seeding progress.
 */
export function PoolMeter({
  count,
  target = POOL_TARGET,
  className,
}: {
  count: number;
  target?: number;
  className?: string;
}) {
  const overflow = Math.max(0, count - target);
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-[3px] gap-y-1", className)}
      role="img"
      aria-label={`${count} of about ${target} personas`}
    >
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-[5px] rounded-full",
            i < count ? "bg-primary" : "bg-foreground/12",
          )}
        />
      ))}
      {overflow > 0 && (
        <span className="ml-0.5 font-mono text-[10px] leading-none text-primary">
          +{overflow}
        </span>
      )}
    </span>
  );
}
