import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/*
 * Dual-font system. Loaded through next/font so they're self-hosted and
 * preloaded — no external request, no layout shift. Each exposes a CSS
 * variable that globals.css consumes, keeping font choice a token like any
 * other rather than something hardcoded into components.
 */
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

/** The personality voice. Editorial and high-contrast; headlines only. */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

/** The technical voice. Section labels, metrics, identifiers. */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LaunchLab",
  description:
    "Your executive team, before you hire one. Delegate an objective to your CTO or CMO — each gathers evidence, analyses it, and hands back findings plus artifacts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
