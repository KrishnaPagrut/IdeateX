import Link from "next/link";

export type RoleKey = "cto" | "cmo";

const ROLE_TONE: Record<RoleKey, string> = {
  cto: "var(--cto)",
  cmo: "var(--cmo)",
};

/**
 * App shell. Navigation is role-based rather than a linear wizard — a company
 * delegates to whichever executive the objective calls for, in any order.
 */
export function Shell({
  children,
  company,
  companyId,
  role,
}: {
  children: React.ReactNode;
  company?: string;
  companyId?: string;
  role?: RoleKey;
}) {
  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-30 border-b bg-[var(--bg)]/80 backdrop-blur-md"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="page flex h-16 items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="LaunchLab home">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "var(--gradient)", boxShadow: "var(--shadow-accent)" }}
            >
              <span className="h-2 w-2 rounded-[3px] bg-white" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">LaunchLab</span>
          </Link>

          {companyId && (
            <>
              <span aria-hidden="true" style={{ color: "var(--line-strong)" }}>
                /
              </span>
              <Link
                href={`/campaign/${companyId}`}
                className="text-[14px] font-medium transition-colors hover:text-[var(--accent)]"
              >
                {company ?? "Company"}
              </Link>

              <nav className="ml-3 flex items-center gap-1" aria-label="Roles">
                {(
                  [
                    { key: "cto", label: "CTO", href: `/campaign/${companyId}/cto` },
                    { key: "cmo", label: "CMO", href: `/campaign/${companyId}/cmo` },
                  ] as const
                ).map((r) => {
                  const active = role === r.key;
                  const tone = ROLE_TONE[r.key];
                  return (
                    <Link
                      key={r.key}
                      href={r.href}
                      aria-current={active ? "page" : undefined}
                      className="mono flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] uppercase tracking-[0.1em] transition-all"
                      style={{
                        background: active ? `${"var(--panel)"}` : "transparent",
                        border: `1px solid ${active ? "var(--line)" : "transparent"}`,
                        color: active ? "var(--ink)" : "var(--muted)",
                        boxShadow: active ? "var(--shadow-sm)" : "none",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: tone, opacity: active ? 1 : 0.4 }}
                      />
                      {r.label}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            {companyId && (
              <span className="mono text-[11px]" style={{ color: "var(--faint)" }}>
                {companyId}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="page px-6 py-8">{children}</main>
    </div>
  );
}

export function ProviderBadge({ live, name }: { live: boolean; name: string }) {
  const tone = live ? "var(--pos)" : "var(--warn)";
  return (
    <span
      className="mono inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10.5px] uppercase tracking-[0.12em]"
      style={{
        borderColor: live ? "rgb(15 138 77 / 0.3)" : "rgb(180 83 9 / 0.3)",
        background: live ? "rgb(15 138 77 / 0.06)" : "rgb(180 83 9 / 0.06)",
        color: tone,
      }}
      title={
        live
          ? "Live Grok calls"
          : "No XAI_API_KEY set — running on the deterministic offline provider"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "pulse-dot" : ""}`}
        style={{ background: tone }}
      />
      {live ? `live · ${name}` : "offline · seeded"}
    </span>
  );
}
