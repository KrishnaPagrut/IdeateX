"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, PencilIcon, RefreshCwIcon } from "lucide-react";

import type { Persona } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
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
import { Toaster } from "@/components/ui/sonner";
import { incomeBandLabel } from "./income-bands";
import { MatrixLoader } from "./matrix-loader";
import { PersonaAvatar } from "./persona-avatar";
import { PersonaEditor, type PersonaDraft } from "./persona-editor";
import { PsychoDots } from "./psycho-dots";

function DemoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function PersonaDetail({ id }: { id: string }) {
  const router = useRouter();
  const [persona, setPersona] = React.useState<Persona | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/personas/${id}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) throw new Error("Persona not found");
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as { persona: Persona };
        setPersona(body.persona);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load persona");
      });
    return () => controller.abort();
  }, [id]);

  async function patch(body: Partial<PersonaDraft>): Promise<Persona> {
    const res = await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
    const data = (await res.json()) as { persona: Persona };
    return data.persona;
  }

  async function handleSave(draft: PersonaDraft) {
    setSaving(true);
    try {
      const updated = await patch(draft);
      setPersona(updated);
      setEditing(false);
      toast.success("Persona saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateBackstory() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/personas/${id}/regenerate-backstory`, { method: "POST" });
      if (!res.ok) throw new Error(`Regeneration failed (${res.status})`);
      const { backstory } = (await res.json()) as { backstory: string };
      const updated = await patch({ backstory });
      setPersona(updated);
      toast.success("Backstory regenerated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Deactivation failed (${res.status})`);
      toast.success("Persona deactivated");
      router.push("/personas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deactivation failed");
      setDeactivating(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error}.</p>
        <Button variant="outline" className="mt-4" render={<Link href="/personas" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to library
        </Button>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-24">
        <MatrixLoader size={28} label="Loading persona" />
        <p className="mt-3 font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
          Loading persona
        </p>
      </div>
    );
  }

  const d = persona.demographics;
  const p = persona.psychographics;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <Toaster position="bottom-right" />

      <Link
        href="/personas"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Library
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-10 md:grid-cols-[220px_1fr]">
        {/* Identity rail */}
        <aside className="flex flex-col items-start gap-4">
          <PersonaAvatar seed={persona.avatarSeed} name={persona.name} size={96} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {persona.name}
            </h1>
            <Badge variant="outline" className="mt-2">
              {persona.archetype}
            </Badge>
          </div>
          <dl className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
            <div>
              POOL{" "}
              <span title="The domain/subdomain pool planners cast this persona from">
                {persona.domain}/{persona.subdomain}
              </span>
            </div>
            <div>
              SRC <span className="uppercase">{persona.source}</span>
            </div>
            <div>ID {persona.id.slice(0, 8)}</div>
          </dl>

          {!editing && (
            <div className="flex flex-col items-stretch gap-2 self-stretch">
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit persona
              </Button>
              <Dialog>
                <DialogTrigger render={<Button variant="destructive" disabled={deactivating} />}>
                  {deactivating ? "Deactivating…" : "Deactivate"}
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deactivate {persona.name}?</DialogTitle>
                    <DialogDescription>
                      The persona leaves the active population and won’t be cast in new
                      runs. Past runs keep their references.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter showCloseButton>
                    <Button
                      variant="destructive"
                      onClick={handleDeactivate}
                      disabled={deactivating}
                    >
                      Deactivate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </aside>

        {/* Character sheet */}
        <main className="min-w-0">
          {editing ? (
            <PersonaEditor
              persona={persona}
              saving={saving}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-col gap-8">
              <section>
                <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                  Demographics
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <DemoField label="Age" value={d.age} />
                  <DemoField label="Gender" value={d.gender} />
                  <DemoField label="Location" value={d.location} />
                  <DemoField label="Income" value={incomeBandLabel(d.incomeBand)} />
                  <DemoField label="Education" value={d.education} />
                  <DemoField label="Occupation" value={d.occupation} />
                </dl>
              </section>

              <section>
                <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                  Psychographics
                </h2>
                <div className="mt-3 grid max-w-xl grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
                  <PsychoDots label="Tech savviness" value={p.techSavviness} />
                  <PsychoDots label="Risk tolerance" value={p.riskTolerance} />
                  <PsychoDots label="Price sensitivity" value={p.priceSensitivity} />
                  <PsychoDots label="Openness" value={p.openness} />
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DemoField
                    label="Values"
                    value={
                      <span className="flex flex-wrap gap-1.5">
                        {p.values.map((v) => (
                          <Badge key={v} variant="secondary">
                            {v}
                          </Badge>
                        ))}
                      </span>
                    }
                  />
                  <DemoField label="Spending habits" value={p.spendingHabits} />
                </dl>
              </section>

              <section>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                    Backstory
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateBackstory}
                    disabled={regenerating}
                  >
                    {regenerating ? (
                      <>
                        <MatrixLoader size={14} label="Regenerating backstory" />
                        Regenerating…
                      </>
                    ) : (
                      <>
                        <RefreshCwIcon data-icon="inline-start" />
                        Regenerate backstory
                      </>
                    )}
                  </Button>
                </div>
                <p className="mt-3 max-w-prose text-sm leading-6 text-foreground/90">
                  {persona.backstory}
                </p>
              </section>

              <section>
                <h2 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                  Casting labels
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Planners match these against their casting contracts when drawing from
                  the {persona.domain}/{persona.subdomain} pool.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {persona.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="font-mono text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
