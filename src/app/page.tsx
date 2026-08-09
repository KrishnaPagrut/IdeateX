import { NewRunForm } from "@/components/run-form/new-run-form";

export default function NewRunPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="rise-in flex flex-col gap-4">
        <p className="font-mono text-xs tracking-eyebrow text-primary uppercase">New run</p>
        <h1 className="font-serif text-4xl leading-[1.12] font-bold tracking-tight text-balance">
          Put your idea in front of a hundred skeptics.
        </h1>
        <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          IdeateX frames your idea, casts a synthetic population of personas, lets them react in
          parallel, red-teams the result, and hands you a verdict — before it meets real people.
        </p>
      </header>
      <div className="mt-12">
        <NewRunForm />
      </div>
    </div>
  );
}
