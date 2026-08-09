import type { Metadata } from "next";

import { PersonaDetail } from "@/components/personas/persona-detail";

export const metadata: Metadata = {
  title: "Persona · IdeateX",
};

export default async function PersonaPage(props: PageProps<"/personas/[personaId]">) {
  const { personaId } = await props.params;
  return <PersonaDetail id={personaId} />;
}
