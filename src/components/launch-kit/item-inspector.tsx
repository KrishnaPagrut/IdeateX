"use client";

import { useState, type ReactNode } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ITEM_STATES, type CampaignItemSnapshot, type ItemState } from "@/lib/schemas/launch";
import type { ItemPatch } from "@/lib/hooks/use-launch-kit";

import { ImageSkeleton, ItemImage } from "./image-skeleton";
import { dayLabel, KIND_LABELS } from "./item-chrome";

// ---------------------------------------------------------------------------
// Item inspector — a right-side sheet like the agent drawer. Leads with the
// item's PURPOSE (why it exists, traced to the simulation's findings), then
// the visual, then the editable copy. Traceability first, editing second.
// ---------------------------------------------------------------------------

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-3xs tracking-eyebrow text-muted-foreground uppercase">{children}</p>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <p className="truncate font-mono text-xs text-foreground">{value}</p>
    </div>
  );
}

function InspectorBody({
  item,
  imageUrl,
  onPatch,
}: {
  item: CampaignItemSnapshot;
  imageUrl: string | null;
  onPatch: (itemId: string, patch: ItemPatch) => Promise<void>;
}) {
  const [body, setBody] = useState(item.body);
  const [cta, setCta] = useState(item.callToAction);
  const [busy, setBusy] = useState<string | null>(null);

  const dirty = body !== item.body || cta !== item.callToAction;

  async function patch(label: string, patchBody: ItemPatch) {
    setBusy(label);
    try {
      await onPatch(item.id, patchBody);
    } catch {
      toast.error("Save failed — the item is unchanged");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {/* Purpose — the traceability core: every item cites its reason. */}
      <figure className="rounded-lg border-l-2 border-primary bg-secondary/50 py-3 pr-3 pl-4">
        <Eyebrow>Why this item exists</Eyebrow>
        <blockquote className="mt-1 font-serif text-sm leading-relaxed text-foreground">
          {item.purpose}
        </blockquote>
        {item.targetCohorts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.targetCohorts.map((cohort) => (
              <Badge key={cohort} variant="outline" className="text-3xs font-normal">
                {cohort}
              </Badge>
            ))}
          </div>
        )}
      </figure>

      {/* Visual */}
      {item.imagePrompt && (
        <div>
          <Eyebrow>Key visual</Eyebrow>
          <div className="mt-1.5 overflow-hidden rounded-lg border">
            {imageUrl ? (
              <ItemImage src={imageUrl} alt={item.title} className="aspect-video w-full" />
            ) : (
              <ImageSkeleton className="aspect-video w-full" />
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void patch("regenerate", { action: "regenerate_image" })}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {busy === "regenerate" ? "Requesting…" : "Regenerate image"}
            </Button>
            <p className="font-mono text-3xs text-muted-foreground">
              re-renders from the brief below
            </p>
          </div>
          <p className="mt-2 font-mono text-2xs leading-relaxed text-muted-foreground">
            {item.imagePrompt}
          </p>
        </div>
      )}

      <Separator />

      {/* Copy */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`copy-${item.id}`}>Copy</Label>
          <Textarea
            id={`copy-${item.id}`}
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="resize-none text-xs leading-relaxed"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cta-${item.id}`}>Call to action</Label>
          <Input
            id={`cta-${item.id}`}
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="text-xs"
          />
        </div>
        {item.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-mono text-3xs font-normal">
                #{tag.replace(/^#/, "")}
              </Badge>
            ))}
          </div>
        )}
        <Button
          size="sm"
          disabled={!dirty || busy !== null}
          onClick={() => void patch("save", { body, callToAction: cta })}
        >
          {busy === "save" ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Separator />

      {/* Facts */}
      <div className="grid grid-cols-3 gap-2">
        <Fact label="Kind" value={KIND_LABELS[item.kind]} />
        <Fact label="Platform" value={item.platform} />
        <Fact label="Day" value={dayLabel(item.dayOffset)} />
      </div>

      {/* State */}
      <div>
        <Eyebrow>State</Eyebrow>
        <div
          role="group"
          aria-label="Item state"
          className="mt-1.5 inline-flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {ITEM_STATES.map((state: ItemState) => (
            <button
              key={state}
              type="button"
              aria-pressed={item.state === state}
              disabled={busy !== null}
              onClick={() => item.state !== state && void patch(`state-${state}`, { state })}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-3xs tracking-eyebrow uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                item.state === state
                  ? state === "cut"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {state}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ItemInspector({
  item,
  imageUrl,
  onClose,
  onPatch,
}: {
  /** The inspected item, or null when the sheet is closed. */
  item: CampaignItemSnapshot | null;
  /** Resolved visual: the persisted url or the stream's fresher one. */
  imageUrl: string | null;
  onClose: () => void;
  onPatch: (itemId: string, patch: ItemPatch) => Promise<void>;
}) {
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:sm:max-w-lg"
        aria-describedby={undefined}
      >
        {item && (
          <>
            <SheetHeader className="border-b pr-12">
              <Eyebrow>
                {KIND_LABELS[item.kind]} · {item.platform} · {dayLabel(item.dayOffset)}
              </Eyebrow>
              <SheetTitle className="truncate">{item.title}</SheetTitle>
              <SheetDescription className="sr-only">Campaign item details</SheetDescription>
            </SheetHeader>
            {/* Keyed by id so copy drafts reset when the inspected item changes. */}
            <InspectorBody key={item.id} item={item} imageUrl={imageUrl} onPatch={onPatch} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
