import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Shared chrome that turns the results view into one numbered document: a
// slim sticky contents rail plus §-numbered section headers with hairline
// rules. Numbers encode true document order — ResultsView builds the section
// list dynamically, so conditional sections (method, focus group, critiques)
// never leave gaps and the rail always matches what's on the page.
// ---------------------------------------------------------------------------

export interface ReportSectionDef {
  id: string;
  /** Short label for the sticky contents rail. */
  label: string;
  title: string;
  sub?: string;
  node: ReactNode;
}

export function ReportSection({
  id,
  index,
  title,
  sub,
  children,
}: {
  id: string;
  /** 1-based position in the rendered document. */
  index: number;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <header
        className={
          index === 1
            ? "mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
            : "mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-5"
        }
      >
        <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">
          §{String(index).padStart(2, "0")}
        </span>
        <h3 id={`${id}-title`} className="text-sm font-medium">
          {title}
        </h3>
        {sub && (
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            {sub}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Sticky one-line table of contents. Sits below the h-12 app nav. */
export function ReportIndex({ sections }: { sections: Array<{ id: string; label: string }> }) {
  return (
    <nav
      aria-label="Report sections"
      className="sticky top-12 z-20 -mx-1 border-b bg-background/90 px-1 backdrop-blur supports-[backdrop-filter]:bg-background/75"
    >
      <ol className="flex items-center gap-0.5 overflow-x-auto py-1.5 whitespace-nowrap">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex items-baseline gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <span className="text-primary/70">{String(i + 1).padStart(2, "0")}</span>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
