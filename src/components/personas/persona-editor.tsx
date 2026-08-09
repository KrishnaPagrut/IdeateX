"use client";

import * as React from "react";

import type { Persona } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { INCOME_BANDS } from "./income-bands";
import { MatrixLoader } from "./matrix-loader";

/** The editable subset of a persona — matches GeneratedPersonaSchema. */
export interface PersonaDraft {
  name: string;
  archetype: string;
  demographics: Persona["demographics"];
  psychographics: Persona["psychographics"];
  backstory: string;
  tags: string[];
}

function draftFrom(persona: Persona): PersonaDraft {
  return {
    name: persona.name,
    archetype: persona.archetype,
    demographics: { ...persona.demographics },
    psychographics: { ...persona.psychographics, values: [...persona.psychographics.values] },
    backstory: persona.backstory,
    tags: [...persona.tags],
  };
}

/** Clickable 1–5 dot input — same motif as the read-only scales. */
function DotInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
        {label}
      </span>
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label={`${label}, 1 to 5`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5`}
            onClick={() => onChange(n)}
            className={cn(
              "size-3.5 rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              n <= value ? "bg-foreground/75 hover:bg-foreground" : "bg-foreground/15 hover:bg-foreground/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PersonaEditor({
  persona,
  onSave,
  onCancel,
  saving,
}: {
  persona: Persona;
  onSave: (draft: PersonaDraft) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = React.useState<PersonaDraft>(() => draftFrom(persona));
  const [valuesText, setValuesText] = React.useState(persona.psychographics.values.join(", "));
  const [tagsText, setTagsText] = React.useState(persona.tags.join(", "));
  const [issue, setIssue] = React.useState<string | null>(null);

  function setDemo<K extends keyof PersonaDraft["demographics"]>(
    key: K,
    value: PersonaDraft["demographics"][K],
  ) {
    setDraft((d) => ({ ...d, demographics: { ...d.demographics, [key]: value } }));
  }

  function setPsycho<K extends keyof PersonaDraft["psychographics"]>(
    key: K,
    value: PersonaDraft["psychographics"][K],
  ) {
    setDraft((d) => ({ ...d, psychographics: { ...d.psychographics, [key]: value } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const values = splitList(valuesText);
    const tags = splitList(tagsText).map((t) => t.toLowerCase());
    if (!draft.name.trim()) return setIssue("Name is required.");
    if (!draft.archetype.trim()) return setIssue("Archetype is required.");
    if (draft.demographics.age < 16 || draft.demographics.age > 90)
      return setIssue("Age must be between 16 and 90.");
    if (values.length < 2 || values.length > 4)
      return setIssue("Values needs 2–4 comma-separated entries.");
    if (tags.length < 2 || tags.length > 6)
      return setIssue("Tags needs 2–6 comma-separated entries.");
    if (!draft.backstory.trim()) return setIssue("Backstory is required.");
    setIssue(null);
    void onSave({
      ...draft,
      name: draft.name.trim(),
      archetype: draft.archetype.trim(),
      psychographics: { ...draft.psychographics, values },
      tags,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </Field>
        <Field label="Archetype">
          <Input
            value={draft.archetype}
            onChange={(e) => setDraft((d) => ({ ...d, archetype: e.target.value }))}
          />
        </Field>
      </section>

      <section>
        <h3 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
          Demographics
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Age">
            <Input
              type="number"
              min={16}
              max={90}
              value={draft.demographics.age}
              onChange={(e) => setDemo("age", Number(e.target.value))}
            />
          </Field>
          <Field label="Gender">
            <Input
              value={draft.demographics.gender}
              onChange={(e) => setDemo("gender", e.target.value)}
            />
          </Field>
          <Field label="Location">
            <Input
              value={draft.demographics.location}
              onChange={(e) => setDemo("location", e.target.value)}
            />
          </Field>
          <Field label="Income band">
            <Select
              items={INCOME_BANDS.map((b) => ({ value: b.value as string, label: b.label }))}
              value={draft.demographics.incomeBand}
              onValueChange={(value) => setDemo("incomeBand", value as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOME_BANDS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Education">
            <Input
              value={draft.demographics.education}
              onChange={(e) => setDemo("education", e.target.value)}
            />
          </Field>
          <Field label="Occupation">
            <Input
              value={draft.demographics.occupation}
              onChange={(e) => setDemo("occupation", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
          Psychographics
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
          <DotInput
            label="Tech savviness"
            value={draft.psychographics.techSavviness}
            onChange={(v) => setPsycho("techSavviness", v)}
          />
          <DotInput
            label="Risk tolerance"
            value={draft.psychographics.riskTolerance}
            onChange={(v) => setPsycho("riskTolerance", v)}
          />
          <DotInput
            label="Price sensitivity"
            value={draft.psychographics.priceSensitivity}
            onChange={(v) => setPsycho("priceSensitivity", v)}
          />
          <DotInput
            label="Openness"
            value={draft.psychographics.openness}
            onChange={(v) => setPsycho("openness", v)}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Values (comma-separated, 2–4)">
            <Input value={valuesText} onChange={(e) => setValuesText(e.target.value)} />
          </Field>
          <Field label="Spending habits">
            <Input
              value={draft.psychographics.spendingHabits}
              onChange={(e) => setPsycho("spendingHabits", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <Field label="Backstory">
        <Textarea
          value={draft.backstory}
          rows={6}
          onChange={(e) => setDraft((d) => ({ ...d, backstory: e.target.value }))}
        />
      </Field>

      <Field label="Tags (comma-separated, 2–6)">
        <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
      </Field>

      {issue && <p className="text-sm text-destructive">{issue}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <MatrixLoader size={16} label="Saving" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
