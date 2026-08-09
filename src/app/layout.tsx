import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TopNav } from "@/components/layout/top-nav";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TopNav />
        <main className="flex flex-1 flex-col">{children}</main>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
