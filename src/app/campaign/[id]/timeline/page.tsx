"use client";

/**
 * Campaign timeline. Three views over the same items, an inspector for
 * per-field editing, and the granular AI actions. Drag-and-drop reschedules by
 * dropping an item on a day column.
 */
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Shell, ProviderBadge } from "@/components/Shell";
import { ImageSkeleton, useImageStream } from "@/components/useImageStream";

type Item = {
  id: string;
  kind: string;
  state: string;
  title: string;
  body: string;
  scheduledAt: string;
  platform: string;
  purpose: string;
  callToAction: string | null;
  hashtags: string[];
  imagePrompt: string | null;
  imageUrl: string | null;
  imageVariants: string[];
  form: any;
  version: number;
};

const AI_ACTIONS = [
  { id: "rewrite_shorter", label: "Rewrite shorter" },
  { id: "make_more_direct", label: "Make more direct" },
  { id: "make_funnier", label: "Make funnier" },
  { id: "replace_hook", label: "Replace hook" },
  { id: "replace_cta", label: "Replace CTA" },
  { id: "generate_alternatives", label: "3 alternatives" },
  { id: "adapt_for_platform", label: "Adapt for platform" },
  { id: "regenerate_image", label: "Regenerate image" },
];

const STATES = ["draft", "needs_review", "approved", "scheduled", "published"];

const KIND_ICON: Record<string, string> = {
  x_post: "𝕏", x_thread: "𝕏", instagram_post: "◲", instagram_carousel: "◫",
  image_ad: "▣", poll: "◍", survey: "☰", lead_form: "☰", landing_section: "▤",
  product_demo: "▶", community_prompt: "◈", follow_up: "↻", response_template: "⤺",
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function DraggableCard({ item, onClick, selected }: { item: Item; onClick: () => void; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="panel-2 cursor-grab p-2.5 active:cursor-grabbing"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
        outline: selected ? "1px solid var(--accent)" : "none",
        zIndex: isDragging ? 50 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-[var(--muted)]">{KIND_ICON[item.kind] ?? "•"}</span>
        <span className="mono text-[9.5px] uppercase text-[var(--faint)]">{item.platform}</span>
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full"
          style={{
            background:
              item.state === "approved" ? "var(--pos)" : item.state === "needs_review" ? "var(--warn)" : "var(--faint)",
          }}
        />
      </div>
      <p className="mt-1 text-[12px] font-medium leading-snug">{item.title}</p>
      <p className="mono mt-1 text-[10px] text-[var(--faint)]">{item.scheduledAt.slice(11, 16)}</p>
    </div>
  );
}

function DayColumn({ day, items, onSelect, selectedId }: { day: string; items: Item[]; onSelect: (i: Item) => void; selectedId?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const d = new Date(day + "T00:00:00Z");
  return (
    <div
      ref={setNodeRef}
      className="panel min-w-[172px] flex-1 p-2.5 transition-colors"
      style={{ background: isOver ? "var(--accent-soft)" : undefined, borderColor: isOver ? "var(--accent)" : undefined }}
    >
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[12px] font-semibold">
          {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
        </span>
        <span className="mono text-[10.5px] text-[var(--faint)]">
          {d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <DraggableCard key={i.id} item={i} onClick={() => onSelect(i)} selected={i.id === selectedId} />
        ))}
        {!items.length && <div className="py-4 text-center text-[11px] text-[var(--faint)]">—</div>}
      </div>
    </div>
  );
}

export default function TimelinePage({ params }: { params: { id: string } }) {
  const [items, setItems] = useState<Item[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [sel, setSel] = useState<Item | null>(null);
  const [view, setView] = useState<"calendar" | "list" | "assets">("calendar");
  const [busy, setBusy] = useState<string | null>(null);
  const [alts, setAlts] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Items arrive without images; they stream in and get swapped over the
  // shimmer placeholders as each one finishes generating.
  const needsImages = items.some((i) => i.imagePrompt && !i.imageUrl);
  const streamed = useImageStream(params.id, needsImages);
  const imageFor = (i: Item) => i.imageUrl ?? streamed.urls[i.id];

  async function load() {
    // no-store: this is re-fetched after every edit, so a cached response
    // would silently show the pre-edit item.
    const r = await fetch(`/api/campaign/${params.id}`, { cache: "no-store" }).then((x) => x.json());
    // This board is the CMO's; CTO artifacts have their own view.
    setItems((r.items ?? []).filter((i: Item & { role?: string }) => i.role !== "cto"));
    setCampaign(r.campaign);
    setProvider(r.provider);
    setSel((prev) => (prev ? (r.items ?? []).find((i: Item) => i.id === prev.id) ?? null : null));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function patch(id: string, body: Record<string, unknown>, label: string) {
    setBusy(label);
    setAlts(null);
    setNote(null);
    try {
      const res = await fetch(`/api/item/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.alternatives) setAlts(d.alternatives);
      if (d.note) setNote(d.note);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const overId = String(e.over?.id ?? "");
    if (!overId.startsWith("day:")) return;
    const item = items.find((i) => i.id === e.active.id);
    if (!item) return;
    const newDay = overId.slice(4);
    if (dayKey(item.scheduledAt) === newDay) return;
    patch(item.id, { action: "move_date", actionArg: `${newDay}T${item.scheduledAt.slice(11)}` }, "move");
  }

  const days = useMemo(() => {
    const set = new Set(items.map((i) => dayKey(i.scheduledAt)));
    return [...set].sort();
  }, [items]);

  const byDay = useMemo(() => {
    const m: Record<string, Item[]> = {};
    items.forEach((i) => {
      const k = dayKey(i.scheduledAt);
      (m[k] ??= []).push(i);
    });
    Object.values(m).forEach((l) => l.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return m;
  }, [items]);

  const approved = items.filter((i) => i.state === "approved").length;

  return (
    <Shell role="cmo" companyId={params.id} company={campaign?.brief?.productName}>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {campaign?.brief?.productName} — campaign timeline
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            {items.length} items · {approved} approved · generated from the winning strategy and{" "}
            the simulation&apos;s findings
          </p>
          {streamed.active && (
            <p className="slide-in mt-1.5 flex items-center gap-2 text-[12.5px] text-[var(--accent)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              Generating visuals — {streamed.received} of {streamed.pending}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ProviderBadge live={provider?.live ?? false} name={provider?.name ?? "mock"} />
          <div className="flex gap-1 rounded-lg border border-[var(--line)] p-1">
            {(["calendar", "list", "assets"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="rounded-md px-3 py-1 text-[12.5px] capitalize transition-colors"
                style={{ background: view === v ? "var(--panel-2)" : "transparent", color: view === v ? "var(--ink)" : "var(--muted)" }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {view === "calendar" && (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="scroll-thin flex gap-2.5 overflow-x-auto pb-2">
                {days.map((d) => (
                  <DayColumn key={d} day={d} items={byDay[d] ?? []} onSelect={setSel} selectedId={sel?.id} />
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-[var(--faint)]">Drag any item to another day to reschedule it.</p>
            </DndContext>
          )}

          {view === "list" && (
            <div className="space-y-2">
              {items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setSel(i)}
                  className="panel flex w-full items-center gap-3 p-3 text-left"
                  style={{ outline: sel?.id === i.id ? "1px solid var(--accent)" : "none" }}
                >
                  <span className="text-[15px] text-[var(--muted)]">{KIND_ICON[i.kind] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium">{i.title}</span>
                      <span className="mono text-[10px] uppercase text-[var(--faint)]">{i.platform}</span>
                    </div>
                    <p className="truncate text-[12px] text-[var(--muted)]">{i.body.split("\n")[0]}</p>
                  </div>
                  <span className="mono text-[11px] text-[var(--faint)]">{i.scheduledAt.slice(0, 16).replace("T", " ")}</span>
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      background: i.state === "approved" ? "rgb(15 138 77 / 0.12)" : "var(--track)",
                      color: i.state === "approved" ? "var(--pos)" : "var(--muted)",
                    }}
                  >
                    {i.state.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          )}

          {view === "assets" && (
            <div className="grid grid-cols-4 gap-3">
              {items.filter((i) => i.imagePrompt).map((i) => (
                <button key={i.id} onClick={() => setSel(i)} className="panel overflow-hidden text-left">
                  {imageFor(i) ? (
                    // Grok Imagine returns 16:9; match it so generated text
                    // near the edges isn't cropped out of the frame.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageFor(i)}
                      alt={i.title}
                      className="slide-in aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <ImageSkeleton className="aspect-[16/9] w-full" />
                  )}
                  <div className="p-2.5">
                    <p className="text-[12.5px] font-medium">{i.title}</p>
                    <p className="mono mt-0.5 text-[10px] text-[var(--faint)]">{i.scheduledAt.slice(0, 10)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Inspector */}
        {sel && (
          <aside className="panel slide-in w-[400px] shrink-0 self-start p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <span className="mono text-[10px] uppercase text-[var(--faint)]">{sel.kind.replace(/_/g, " ")}</span>
                <h3 className="text-[15px] font-semibold">{sel.title}</h3>
              </div>
              <button className="text-[var(--muted)] hover:text-white" onClick={() => setSel(null)}>
                ✕
              </button>
            </div>

            <div className="panel-2 mb-3 p-2.5">
              <p className="text-[11.5px] leading-snug text-[var(--accent)]">
                <span className="text-[var(--faint)]">Purpose from simulation: </span>
                {sel.purpose}
              </p>
            </div>

            {imageFor(sel) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageFor(sel)} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
            ) : sel.imagePrompt ? (
              <ImageSkeleton className="mb-3 aspect-video w-full rounded-lg" />
            ) : null}
            {sel.imageVariants.length > 1 && (
              <div className="mb-3 flex gap-2">
                {sel.imageVariants.map((v, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={v}
                    alt=""
                    onClick={() => patch(sel.id, { patch: { imageUrl: v } }, "pick")}
                    className="h-12 w-12 cursor-pointer rounded object-cover"
                    style={{ outline: v === sel.imageUrl ? "2px solid var(--accent)" : "none" }}
                  />
                ))}
              </div>
            )}

            <label className="label">Copy</label>
            <textarea
              className="field mb-3 resize-none"
              rows={6}
              value={sel.body}
              onChange={(e) => setSel({ ...sel, body: e.target.value })}
              onBlur={(e) => patch(sel.id, { patch: { body: e.target.value } }, "save")}
            />

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date &amp; time</label>
                <input
                  className="field"
                  type="datetime-local"
                  value={sel.scheduledAt.slice(0, 16)}
                  onChange={(e) => patch(sel.id, { patch: { scheduledAt: e.target.value + ":00.000Z" } }, "date")}
                />
              </div>
              <div>
                <label className="label">State</label>
                <select
                  className="field"
                  value={sel.state}
                  onChange={(e) => patch(sel.id, { patch: { state: e.target.value } }, "state")}
                >
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sel.callToAction != null && (
              <>
                <label className="label">Call to action</label>
                <input
                  className="field mb-3"
                  value={sel.callToAction ?? ""}
                  onChange={(e) => setSel({ ...sel, callToAction: e.target.value })}
                  onBlur={(e) => patch(sel.id, { patch: { callToAction: e.target.value } }, "cta")}
                />
              </>
            )}

            {sel.form && (
              <div className="panel-2 mb-3 p-3">
                <div className="label mb-1.5">Form preview — not yet created externally</div>
                <p className="text-[12.5px] font-medium">{sel.form.title}</p>
                <ol className="mt-1.5 space-y-1">
                  {sel.form.questions?.map((q: any) => (
                    <li key={q.id} className="text-[11.5px] text-[var(--muted)]">
                      · {q.prompt} <span className="mono text-[10px] text-[var(--faint)]">[{q.type}]</span>
                    </li>
                  ))}
                </ol>
                <button className="btn mt-2.5 w-full text-[12.5px]" disabled>
                  Create form (provider not connected)
                </button>
              </div>
            )}

            <label className="label">AI actions</label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {AI_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  className="chip"
                  disabled={!!busy}
                  onClick={() => patch(sel.id, { action: a.id, actionArg: a.id === "adapt_for_platform" ? "instagram" : undefined }, a.id)}
                >
                  {busy === a.id ? "…" : a.label}
                </button>
              ))}
            </div>

            {note && <p className="mb-2 text-[11.5px] text-[var(--pos)]">{note}</p>}
            {alts && (
              <div className="mb-3 space-y-1.5">
                <div className="label">Pick an alternative</div>
                {alts.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => patch(sel.id, { patch: { body: a } }, "alt")}
                    className="panel-2 w-full p-2 text-left text-[12px] leading-snug hover:border-[var(--accent)]"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-[var(--line)] pt-3">
              <span className="mono text-[10.5px] text-[var(--faint)]">v{sel.version}</span>
              <div className="flex gap-2">
                <button
                  className="btn text-[12.5px]"
                  onClick={() => patch(sel.id, { patch: { state: "approved" } }, "approve")}
                  disabled={sel.state === "approved"}
                >
                  Approve
                </button>
                <button
                  className="btn text-[12.5px]"
                  onClick={async () => {
                    await fetch(`/api/item/${sel.id}`, { method: "DELETE" });
                    setSel(null);
                    load();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      <p className="mt-6 text-center text-[11.5px] text-[var(--faint)]">
        Nothing is published or scheduled externally. Every item stays local until you connect a provider.
      </p>
    </Shell>
  );
}
