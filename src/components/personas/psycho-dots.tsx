import { cn } from "@/lib/utils";

/** 1–5 dot scale — the library's recurring dot motif, in miniature. */
export function PsychoDots({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="font-mono text-3xs tracking-eyebrow uppercase text-muted-foreground">
        {label}
      </span>
      <span
        className="flex items-center gap-1"
        role="meter"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={filled}
        aria-label={`${label}: ${filled} of 5`}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i < filled ? "bg-foreground/75" : "bg-foreground/15",
            )}
          />
        ))}
      </span>
    </div>
  );
}
