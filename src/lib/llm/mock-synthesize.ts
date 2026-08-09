import { z } from "zod";

/**
 * Synthesizes a schema-valid value from any zod schema by walking its JSON
 * Schema representation (zod v4's z.toJSONSchema). Values are plausible-ish
 * placeholders, honoring enums, min/max, and array bounds — enough for the
 * pipeline, aggregation, and UI to run realistically without an LLM.
 */
export function synthesizeFromSchema<T>(schema: z.ZodType<T>): T {
  const json = z.toJSONSchema(schema, { io: "output" }) as JsonSchema;
  return synth(json) as T;
}

interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  format?: string;
  default?: unknown;
}

const SAMPLE_STRINGS = [
  "This is a plausible mock response for local development.",
  "Synthetic data — replace with real model output.",
  "The pricing feels steep for what it offers, honestly.",
  "I could see myself trying this if a friend vouched for it.",
  "Interesting concept, though the switching cost worries me.",
];

let counter = 0;

function synth(s: JsonSchema): unknown {
  if (s.const !== undefined) return s.const;
  if (s.enum && s.enum.length > 0) return s.enum[counter++ % s.enum.length];
  const variants = s.anyOf ?? s.oneOf;
  if (variants && variants.length > 0) {
    // Prefer a non-null variant so optional fields get real values.
    const nonNull = variants.find((v) => v.type !== "null");
    return synth(nonNull ?? variants[0]);
  }

  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(s.properties ?? {})) {
        out[key] = synth(prop);
      }
      return out;
    }
    case "array": {
      const min = s.minItems ?? 1;
      const max = s.maxItems ?? Math.max(min, 3);
      const count = Math.min(max, Math.max(min, 2));
      return Array.from({ length: count }, () => synth(s.items ?? { type: "string" }));
    }
    case "string": {
      if (s.format === "uuid") return "00000000-0000-4000-8000-000000000000";
      return SAMPLE_STRINGS[counter++ % SAMPLE_STRINGS.length];
    }
    case "number":
    case "integer": {
      const min = s.minimum ?? 0;
      const max = s.maximum ?? min + 100;
      const value = min + Math.random() * (max - min);
      return type === "integer" ? Math.round(value) : Math.round(value * 100) / 100;
    }
    case "boolean":
      return counter++ % 2 === 0;
    case "null":
      return null;
    default:
      return null;
  }
}
