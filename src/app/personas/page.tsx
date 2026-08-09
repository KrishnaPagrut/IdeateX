import type { Metadata } from "next";

import { PersonaLibrary } from "@/components/personas/persona-library";

export const metadata: Metadata = {
  title: "Persona library · IdeateX",
  description: "The synthetic population your ideas get stress-tested against.",
};

export default function PersonasPage() {
  return <PersonaLibrary />;
}
