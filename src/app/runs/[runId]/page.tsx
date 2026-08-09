import type { Metadata } from "next";

import { RunShell } from "./run-shell";

export const metadata: Metadata = { title: "Run" };

export default async function RunPage({ params }: PageProps<"/runs/[runId]">) {
  const { runId } = await params;
  return <RunShell runId={runId} />;
}
