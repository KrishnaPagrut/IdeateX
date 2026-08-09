import { NewRunForm } from "@/components/run-form/new-run-form";

export default function NewRunPage() {
  return (
    // Same shell as Runs / Personas / top nav (max-w-6xl) so the left edge
    // lines up; the form stays a readable column inside it.
    <div className="mx-auto w-full max-w-6xl px-6 py-14">
      <div className="max-w-2xl">
        <header className="rise-in flex flex-col gap-4">
          <p className="font-mono text-xs tracking-eyebrow text-primary uppercase">New run</p>
          <h1 className="font-serif text-4xl leading-[1.12] font-bold tracking-tight text-balance">
            Race your campaign before the internet sees it.
          </h1>
          <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
            IdeateX builds a synthetic audience for your product, races three campaign strategies
            through it in a live social simulation, has an expert panel pick the winner, stress-tests
            it with a full persona swarm — and hands you the report with ready-to-post content.
          </p>
        </header>
        <div className="mt-12">
          <NewRunForm />
        </div>
      </div>
    </div>
  );
}
