import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Grok Imagine image generation + Supabase Storage persistence.
//
// Ported from LaunchLab's src/lib/ai/grok.ts (kavya/scaffold history): raw
// call against /v1/images/generations requesting b64_json — Grok's hosted
// image URLs are temporary (`xai-tmp-imgen-…`), so bytes are fetched and
// re-hosted on the project's public `campaign-assets` bucket. MOCK_LLM=1
// returns a deterministic inline SVG placeholder (no API, no storage).
// ---------------------------------------------------------------------------

const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image";
const BASE_URL = "https://api.x.ai/v1";
const BUCKET = "campaign-assets";

/** $/image for the cost meter — grok-imagine-image is $0.02, -quality $0.05. */
export const IMAGE_COST_USD = IMAGE_MODEL.includes("quality") ? 0.05 : 0.02;

export interface GeneratedImage {
  /** Public URL (Supabase Storage), or a data: URI in mock/fallback mode. */
  url: string;
  /** Grok's revised prompt when provided — better than ours, keep it. */
  revisedPrompt: string;
}

function mockSvg(prompt: string): string {
  const hue = createHash("sha256").update(prompt).digest()[0] * 1.4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${hue.toFixed(0)},35%,82%)"/><circle cx="320" cy="150" r="60" fill="hsl(${hue.toFixed(0)},45%,60%)"/><text x="320" y="300" font-family="monospace" font-size="16" text-anchor="middle" fill="hsl(${hue.toFixed(0)},60%,25%)">mock visual</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function uploadToStorage(
  bytes: Buffer,
  mimeType: string,
  path: string,
): Promise<string | null> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    console.error(`[image] storage upload failed (${res.status}):`, await res.text());
    return null;
  }
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Generate one image and persist it. `storagePath` should be stable per asset
 * (e.g. `runs/<runId>/<itemId>.jpg`) so regeneration overwrites in place.
 * Falls back to an inline data URI when storage is unavailable.
 */
export async function generateImage(
  prompt: string,
  storagePath: string,
): Promise<GeneratedImage> {
  if (process.env.MOCK_LLM === "1") {
    return { url: mockSvg(prompt), revisedPrompt: prompt };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, response_format: "b64_json" }),
  });
  if (!res.ok) {
    throw new Error(`image generation failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string; mime_type?: string; revised_prompt?: string }>;
  };
  const item = body.data?.[0];
  if (!item) throw new Error("image generation returned no data");
  const revisedPrompt = item.revised_prompt ?? prompt;

  if (item.b64_json) {
    const mime = item.mime_type ?? "image/jpeg";
    const bytes = Buffer.from(item.b64_json, "base64");
    const hosted = await uploadToStorage(bytes, mime, storagePath);
    return { url: hosted ?? `data:${mime};base64,${item.b64_json}`, revisedPrompt };
  }
  if (item.url) return { url: item.url, revisedPrompt };
  throw new Error("image generation returned neither bytes nor url");
}
