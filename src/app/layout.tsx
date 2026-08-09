import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { TopNav } from "@/components/layout/top-nav";
import { Toaster } from "@/components/ui/sonner";

// Inter carries the UI chrome; Berkeley Mono carries data, labels, and
// eyebrows; Iowan Old Style carries headlines and report prose — the
// "printed research dossier" voice.
const inter = localFont({
  src: [
    { path: "./fonts/Inter-Variable.ttf", weight: "100 900", style: "normal" },
    { path: "./fonts/Inter-Italic-Variable.ttf", weight: "100 900", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const berkeleyMono = localFont({
  src: [
    { path: "./fonts/BerkeleyMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/BerkeleyMono-Oblique.ttf", weight: "400", style: "italic" },
    { path: "./fonts/BerkeleyMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

const iowan = localFont({
  src: [
    { path: "./fonts/IowanOldStyle-Roman.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IowanOldStyle-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/IowanOldStyle-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/IowanOldStyle-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-serif",
  fallback: ["Iowan Old Style", "Georgia", "serif"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "IdeateX",
    template: "%s · IdeateX",
  },
  description:
    "Stress-test an idea on a synthetic population of AI personas before it meets real people.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${berkeleyMono.variable} ${iowan.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TopNav />
          <main className="flex flex-1 flex-col">{children}</main>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
