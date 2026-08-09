"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, MinusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RunTier } from "@/lib/db/schema";
import { TIER_SHAPE } from "@/lib/llm/cost";
import { cn } from "@/lib/utils";

const MIN_DESCRIPTION_LENGTH = 20;
const MIN_AUDIENCE_LENGTH = 10;

const TIERS: Array<{
  tier: RunTier;
  name: string;
  blurb: string;
}> = [
  { tier: "quick", name: "Quick", blurb: "A fast pulse-check" },
  { tier: "standard", name: "Standard", blurb: "Balanced cohort coverage" },
  { tier: "deep", name: "Deep", blurb: "A full population sweep" },
];

const DESCRIPTION_PLACEHOLDER =
  "A subscription plant-care app: $6/month, smart reminders, photo-based plant diagnosis, and a rescue kit mailed automatically when a plant is struggling…";

const AUDIENCE_PLACEHOLDER =
  "Urban millennial and Gen-Z plant owners in the US and EU; secondary: gift buyers and retired gardeners.";

const OBJECTIVE_PLACEHOLDER =
  "What should this campaign achieve? e.g. maximize app-store installs at launch without burning trust — and what you want out of this study.";

const CONTEXT_PLACEHOLDER =
  "Market, pricing today, constraints, competitors — anything the study should know.";

export function NewRunForm() {
  const router = useRouter();

  const [productName, setProductName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [targetAudience, setTargetAudience] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [context, setContext] = React.useState("");
  const [showContext, setShowContext] = React.useState(false);
  const [tier, setTier] = React.useState<RunTier>("standard");
  const [grounding, setGrounding] = React.useState(false);
  const [discussion, setDiscussion] = React.useState(true);
  const [personaBudget, setPersonaBudget] = React.useState<number | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [estimate, setEstimate] = React.useState<number | null>(null);
  const [estimating, setEstimating] = React.useState(false);

  // Debounced live cost estimate whenever tier, grounding, or discussion changes.
  React.useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEstimating(true);
      try {
        const res = await fetch("/api/runs/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, grounding, discussion, personaBudget }),
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
  }, [tier, grounding, discussion, personaBudget]);

  const descriptionLength = description.trim().length;
  const descriptionTooShort = descriptionLength < MIN_DESCRIPTION_LENGTH;
  const nameMissing = productName.trim().length < 2;
  const audienceTooShort = targetAudience.trim().length < MIN_AUDIENCE_LENGTH;
  const invalid = nameMissing || descriptionTooShort || audienceTooShort;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          description: description.trim(),
          targetAudience: targetAudience.trim(),
          objective: objective.trim() ? objective.trim() : undefined,
          context: context.trim() ? context.trim() : undefined,
          tier,
          grounding,
          discussion,
          personaBudget,
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
      {/* Product name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="product-name" className="font-mono text-xs tracking-eyebrow uppercase">
          Product
        </Label>
        <Input
          id="product-name"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          onBlur={() => productName.length > 0 && setTouched(true)}
          placeholder="Sprout"
          className="bg-card text-base"
          aria-invalid={touched && nameMissing ? true : undefined}
        />
        {touched && nameMissing && (
          <p className="text-sm text-destructive">Name the product.</p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="description" className="font-mono text-xs tracking-eyebrow uppercase">
            What it is
          </Label>
          <span
            className={cn(
              "font-mono text-2xs tabular-nums",
              touched && descriptionTooShort ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {descriptionLength < MIN_DESCRIPTION_LENGTH
              ? `${descriptionLength}/${MIN_DESCRIPTION_LENGTH} min`
              : `${descriptionLength}`}
          </span>
        </div>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description.length > 0 && setTouched(true)}
          placeholder={DESCRIPTION_PLACEHOLDER}
          className="min-h-28 resize-y bg-card text-base leading-relaxed"
          aria-invalid={touched && descriptionTooShort ? true : undefined}
        />
        {touched && descriptionTooShort ? (
          <p className="text-sm text-destructive">
            Describe the product in at least {MIN_DESCRIPTION_LENGTH} characters so the study has
            something to test.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            State it the way you&apos;d pitch it — the strategies are built from this.
          </p>
        )}
      </div>

      {/* Target audience */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="target-audience" className="font-mono text-xs tracking-eyebrow uppercase">
          Target audience
        </Label>
        <Textarea
          id="target-audience"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          onBlur={() => targetAudience.length > 0 && setTouched(true)}
          placeholder={AUDIENCE_PLACEHOLDER}
          className="min-h-20 resize-y bg-card"
          aria-invalid={touched && audienceTooShort ? true : undefined}
        />
        {touched && audienceTooShort ? (
          <p className="text-sm text-destructive">
            Describe who this is for — cohorts and the synthetic audience are cast from it.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Who you&apos;re trying to reach. The audience cohorts are designed from this.
          </p>
        )}
      </div>

      {/* Objective */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="objective" className="font-mono text-xs tracking-eyebrow uppercase">
          What you&apos;re looking for <span className="text-muted-foreground/60">(optional)</span>
        </Label>
        <Textarea
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder={OBJECTIVE_PLACEHOLDER}
          className="min-h-20 resize-y bg-card"
        />
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
        <Label className="font-mono text-xs tracking-eyebrow uppercase">Population</Label>
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

      {/* Focus group */}
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="discussion" className="text-sm font-medium">
            Run a focus group after first reactions
          </Label>
          <p className="text-xs text-muted-foreground">
            Personas hear their segment peers and respond — who holds firm, who bends, and why.
            One extra reply per persona.
          </p>
        </div>
        <Switch id="discussion" checked={discussion} onCheckedChange={setDiscussion} />
      </div>

      {/* Persona budget */}
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="persona-budget" className="text-sm font-medium">
            Persona budget
          </Label>
          <p className="text-xs text-muted-foreground">
            Cap how many people the planners may cast. Blank uses the tier default
            ({TIER_SHAPE[tier].personaTotal}); planners scale their casting contracts to fit.
          </p>
        </div>
        <Input
          id="persona-budget"
          type="number"
          min={3}
          max={200}
          value={personaBudget ?? ""}
          placeholder={String(TIER_SHAPE[tier].personaTotal)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return setPersonaBudget(null);
            const n = Number(v);
            if (Number.isFinite(n)) setPersonaBudget(Math.max(3, Math.min(200, Math.round(n))));
          }}
          className="w-24 text-right font-mono tabular-nums"
        />
      </div>

      {/* Launch */}
      <div className="flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <span className="text-xs tracking-eyebrow uppercase">Est. cost</span>
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
