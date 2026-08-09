"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "New run", isActive: (path: string) => path === "/" },
  { href: "/runs", label: "Runs", isActive: (path: string) => path.startsWith("/runs") },
  {
    href: "/personas",
    label: "Personas",
    isActive: (path: string) => path.startsWith("/personas"),
  },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="text-sm font-semibold tracking-tight">IdeateX</span>
          <span className="hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:inline">
            synthetic focus groups
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active = link.isActive(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
