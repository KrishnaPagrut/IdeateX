import { NewRunForm } from "@/components/run-form/new-run-form";

export default function NewRunPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-14">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">New run</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Put your idea in front of a hundred skeptics.
        </h1>
        <p className="max-w-prose text-muted-foreground">
          IdeateX frames your idea, casts a synthetic population of personas, lets them react in
          parallel, red-teams the result, and hands you a verdict — before it meets real people.
        </p>
      </header>
      <div className="mt-10">
        <NewRunForm />
      </div>
    </div>
  );
}
