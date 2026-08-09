"use client";

/**
 * Findings panel, shared by every role.
 *
 * Both the CMO (simulation scores) and the CTO (dependency-graph analysis)
 * emit the same Finding shape, so one component renders both. That shared
 * surface is what makes two very different roles read as one product.
 */
import type { Finding, FindingsReport } from "@/lib/schemas";

const TONE = {
  worked: { bg: "rgb(15 138 77 / 0.06)", bd: "rgb(15 138 77 / 0.28)", fg: "var(--pos)", label: "worked" },
  failed: { bg: "rgb(208 52 44 / 0.06)", bd: "rgb(208 52 44 / 0.28)", fg: "var(--neg)", label: "failed" },
  risk: { bg: "rgb(180 83 9 / 0.06)", bd: "rgb(180 83 9 / 0.28)", fg: "var(--warn)", label: "risk" },
  opportunity: { bg: "rgb(91 91 214 / 0.06)", bd: "rgb(91 91 214 / 0.28)", fg: "var(--accent)", label: "opportunity" },
} as const;

export function FindingCard({ finding }: { finding: Finding }) {
  const tone = TONE[finding.kind];
  return (
    <div className="rounded-lg border p-3" style={{ background: tone.bg, borderColor: tone.bd }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.fg }}>
          {tone.label}
        </span>
        <span className="mono text-[10px] text-[var(--faint)]">{finding.axis}</span>
      </div>
      <h4 className="mt-1 text-[13.5px] font-semibold">{finding.headline}</h4>
      <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{finding.detail}</p>
      <p
        className="mt-2 border-l-2 pl-2 text-[12px] leading-snug"
        style={{ borderColor: tone.bd, color: tone.fg }}
      >
        → {finding.directive}
      </p>
    </div>
  );
}

export function FindingsPanel({
  report,
  headline,
  children,
}: {
  report: FindingsReport;
  headline: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {headline}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed">{report.whyItWon}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {report.findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
      {children}
    </div>
  );
}
