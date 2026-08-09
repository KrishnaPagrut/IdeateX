"use client";

import * as React from "react";
import { toast } from "sonner";
import { SparklesIcon } from "lucide-react";

import type { Persona } from "@/lib/db/schema";
import type { PoolInfo } from "@/app/api/personas/pools/route";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MatrixLoader } from "./matrix-loader";

const EXAMPLES = [
  "Risk-averse people from high-income households",
  "First-generation college students juggling jobs",
  "Small-town landlords who self-manage their rentals",
];

/**
 * "New pool" flow: describe a population in free text, the generator turns it
 * into a named custom pool, then the standard batch generator fills it. Two
 * requests — create the pool, then generate into it — so a generation failure
 * still leaves a working (empty) pool with its own top-up button.
 */
export function NewPoolDialog({
  onCreated,
}: {
  /** Called with the new pool's key once it exists (even if seeding failed). */
  onCreated: (poolKey: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");
  const [count, setCount] = React.useState(12);
  const [phase, setPhase] = React.useState<"idle" | "defining" | "generating">("idle");

  const busy = phase !== "idle";

  async function create() {
    setPhase("defining");
    let pool: PoolInfo;
    try {
      const res = await fetch("/api/personas/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const body = (await res.json()) as { pool?: PoolInfo; error?: string };
      if (!res.ok || !body.pool) throw new Error(body.error ?? `Request failed (${res.status})`);
      pool = body.pool;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the pool");
      setPhase("idle");
      return;
    }

    const key = `${pool.domain}/${pool.subdomain}`;
    setPhase("generating");
    try {
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool: key, count }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const body = (await res.json()) as { personas: Persona[] };
      toast.success(`Created "${pool.name}" with ${body.personas.length} personas`);
    } catch (err) {
      toast.error(
        `Pool "${pool.name}" was created, but seeding failed: ${
          err instanceof Error ? err.message : "unknown error"
        }. Open it to generate again.`,
      );
    }

    setPhase("idle");
    setOpen(false);
    setPrompt("");
    onCreated(key);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger render={<Button variant="outline" />}>
        <SparklesIcon data-icon="inline-start" />
        New pool from prompt
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a pool from a prompt</DialogTitle>
          <DialogDescription>
            Describe the population you want — the generator names the pool, writes its
            casting description, and fills it with distinct personas planners can cast.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pool-prompt">Who are these people?</Label>
            <Textarea
              id="pool-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`e.g. "${EXAMPLES[0]}"`}
              rows={3}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Try: {EXAMPLES.slice(1).map((ex, i) => (
                <React.Fragment key={ex}>
                  {i > 0 && " · "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={() => setPrompt(ex)}
                    disabled={busy}
                  >
                    {ex}
                  </button>
                </React.Fragment>
              ))}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="pool-count" className="shrink-0">
              People to generate
            </Label>
            <Input
              id="pool-count"
              type="number"
              min={1}
              max={40}
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setCount(Math.max(1, Math.min(40, Math.round(n))));
              }}
              disabled={busy}
              className="w-20"
            />
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={create} disabled={busy || prompt.trim().length < 8}>
            {busy ? (
              <>
                <MatrixLoader size={16} label="" />
                {phase === "defining" ? "Defining pool…" : "Generating people…"}
              </>
            ) : (
              <>
                <SparklesIcon data-icon="inline-start" />
                Create pool
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
