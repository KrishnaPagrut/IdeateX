"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, MinusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RunTier } from "@/lib/db/schema";
import { TIER_SHAPE } from "@/lib/llm/cost";
import { cn } from "@/lib/utils";

const MIN_IDEA_LENGTH = 20;

const TIERS: Array<{
  tier: RunTier;
  name: string;
  blurb: string;
}> = [
  { tier: "quick", name: "Quick", blurb: "A fast pulse-check" },
  { tier: "standard", name: "Standard", blurb: "Balanced segment coverage" },
  { tier: "deep", name: "Deep", blurb: "A full population sweep" },
];

const IDEA_PLACEHOLDER =
  "We're considering raising our Pro plan from $12 to $18/month for existing subscribers, grandfathering nobody, with a 60-day notice email…";

const CONTEXT_PLACEHOLDER =
  "Audience, market, pricing today, constraints — anything the swarm should know before reacting.";

export function NewRunForm() {
  const router = useRouter();

  const [idea, setIdea] = React.useState("");
  const [context, setContext] = React.useState("");
  const [showContext, setShowContext] = React.useState(false);
  const [tier, setTier] = React.useState<RunTier>("standard");
  const [grounding, setGrounding] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [estimate, setEstimate] = React.useState<number | null>(null);
  const [estimating, setEstimating] = React.useState(false);

  // Debounced live cost estimate whenever tier or grounding changes.
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEstimating(true);
      try {
        const res = await fetch("/api/runs/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, grounding }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { usd: number };
        setEstimate(body.usd);
      } catch {
        // aborted or offline — keep the last estimate
      } finally {
        if (!controller.signal.aborted) setEstimating(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [tier, grounding]);

  const ideaLength = idea.trim().length;
  const ideaTooShort = ideaLength < MIN_IDEA_LENGTH;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (ideaTooShort) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          context: context.trim() ? context.trim() : undefined,
          tier,
          grounding,
        }),
      });
      if (res.status !== 201) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "The run could not be launched — try again");
        setSubmitting(false);
        return;
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/runs/${runId}`);
    } catch {
      toast.error("The run could not be launched — check your connection");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      {/* Idea */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="idea" className="font-mono text-xs tracking-[0.14em] uppercase">
            The idea
          </Label>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              touched && ideaTooShort ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {ideaLength < MIN_IDEA_LENGTH ? `${ideaLength}/${MIN_IDEA_LENGTH} min` : `${ideaLength}`}
          </span>
        </div>
        <Textarea
          id="idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onBlur={() => idea.length > 0 && setTouched(true)}
          placeholder={IDEA_PLACEHOLDER}
          className="min-h-36 resize-y bg-card text-base leading-relaxed"
          aria-invalid={touched && ideaTooShort ? true : undefined}
        />
        {touched && ideaTooShort ? (
          <p className="text-sm text-destructive">
            Describe the idea in at least {MIN_IDEA_LENGTH} characters so the swarm has something
            to react to.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            A product, a policy, a price change, a campaign — state it the way you&apos;d pitch it.
          </p>
        )}
      </div>

      {/* Optional context */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          aria-expanded={showContext}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {showContext ? <MinusIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
          {showContext ? "Remove context" : "Add context"}
          <span className="text-muted-foreground/60">(optional)</span>
        </button>
        {showContext && (
          <Textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={CONTEXT_PLACEHOLDER}
            className="min-h-24 resize-y bg-card"
          />
        )}
      </div>

      {/* Tier */}
      <div className="flex flex-col gap-2">
        <Label className="font-mono text-xs tracking-[0.14em] uppercase">Population</Label>
        <div role="radiogroup" aria-label="Run tier" className="grid gap-3 sm:grid-cols-3">
          {TIERS.map(({ tier: value, name, blurb }) => {
            const shape = TIER_SHAPE[value];
            const selected = tier === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTier(value)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border bg-card p-4 text-left transition-colors",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "border-primary ring-1 ring-primary"
                    : "border-border hover:border-ring/60",
                )}
              >
                <span className="text-sm font-medium">{name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {shape.personaTotal} personas · {shape.planners} planners
                </span>
                <span className="mt-1 text-xs text-muted-foreground">{blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grounding */}
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="grounding" className="text-sm font-medium">
            Ground reactions in live web search
          </Label>
          <p className="text-xs text-muted-foreground">
            Personas can pull current prices and competitors instead of reasoning from memory.
            Adds about $0.10 in search fees.
          </p>
        </div>
        <Switch id="grounding" checked={grounding} onCheckedChange={setGrounding} />
      </div>

      {/* Launch */}
      <div className="flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <span className="text-xs tracking-[0.14em] uppercase">Est. cost</span>
          {estimating ? (
            <DotmSquare3 colorPreset="solid-theme" size={16} dotSize={2} ariaLabel="Estimating cost" />
          ) : (
            <span className="text-foreground tabular-nums">
              {estimate !== null ? `$${estimate.toFixed(2)}` : "—"}
            </span>
          )}
        </div>
        <Button type="submit" size="lg" disabled={submitting} className="min-w-32">
          {submitting ? (
            <>
              <DotmSquare3
                colorPreset="solid-theme"
                size={16}
                dotSize={2}
                ariaLabel="Launching run"
                className="[--color-dot-on:var(--primary-foreground)]"
              />
              Launching…
            </>
          ) : (
            "Launch run"
          )}
        </Button>
      </div>
    </form>
  );
}
