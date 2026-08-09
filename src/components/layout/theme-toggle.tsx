"use client";

import * as React from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

const subscribeNoop = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Render a stable icon until hydrated — resolvedTheme is undefined on the
  // server, and swapping icons during hydration would warn.
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
