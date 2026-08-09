/**
 * Real xAI Grok provider.
 *
 * The xAI API is OpenAI-compatible: chat at /v1/chat/completions with
 * `response_format: json_schema` for structured outputs, images at
 * /v1/images/generations, and live X/web search via `search_parameters`.
 * Docs: https://docs.x.ai/docs/api-reference
 */
import { z } from "zod";
import type { GenerateOptions, ImageResult, LlmProvider } from "./provider";

const BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const CHAT_MODEL = process.env.XAI_CHAT_MODEL ?? "grok-4.5";
const IMAGE_MODEL = process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image";

/**
 * Requests that hang past this are treated as failures so the UI can fall back.
 * Generous, because structured generations of any size routinely take 30-60s.
 */
const TIMEOUT_MS = Number(process.env.XAI_TIMEOUT_MS ?? 120_000);

/**
 * Live search moved off `search_parameters` (now HTTP 410) to the Agent Tools
 * API on /v1/responses. Search therefore runs as a separate free-text call
 * whose output is fed into a normal structured call — two hops, but it keeps
 * search and schema-shaping independently debuggable.
 */
function searchTools(search: GenerateOptions["search"]) {
  if (!search || search === "none") return undefined;
  if (search === "x") return [{ type: "x_search" }];
  if (search === "web") return [{ type: "web_search" }];
  return [{ type: "x_search" }, { type: "web_search" }];
}

async function call(path: string, body: unknown, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`xAI ${path} ${res.status}: ${detail.slice(0, 400)}`);
    }
    return (await res.json()) as any;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The /v1/responses payload nests output items; pull out the assistant text
 * wherever it ended up. Shapes vary between tool-using and plain responses.
 */
function extractResponsesText(res: any): string {
  if (typeof res?.output_text === "string" && res.output_text) return res.output_text;
  const chunks: string[] = [];
  for (const item of res?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").slice(0, 6000);
}

export function createGrokProvider(apiKey: string): LlmProvider {
  return {
    name: "grok",
    live: true,

    async structured<T extends z.ZodTypeAny>(
      schema: T,
      system: string,
      user: string,
      opts: GenerateOptions = {},
    ): Promise<z.infer<T>> {
      const jsonSchema = z.toJSONSchema(schema as z.ZodTypeAny, {
        // xAI's structured-output validator rejects $ref/$defs indirection.
        reused: "inline",
      });

      // When search is requested, gather findings first via the Agent Tools
      // API, then shape them with a plain structured call.
      let researched = "";
      const tools = searchTools(opts.search);
      if (tools) {
        try {
          const res = await call(
            "/responses",
            {
              model: CHAT_MODEL,
              input: [{ role: "user", content: `${system}\n\n${user}` }],
              tools,
            },
            apiKey,
          );
          researched = extractResponsesText(res);
        } catch (err) {
          // Search is a nice-to-have; losing it should not fail the generation.
          console.warn("[grok] search pass failed, continuing without:", err);
        }
      }

      const data = await call(
        "/chat/completions",
        {
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: researched ? `${user}\n\nRESEARCH FINDINGS:\n${researched}` : user,
            },
          ],
          temperature: opts.temperature ?? 0.8,
          max_tokens: opts.maxTokens ?? 8000,
          response_format: {
            type: "json_schema",
            json_schema: { name: "result", strict: true, schema: jsonSchema },
          },
        },
        apiKey,
      );

      const raw = data?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") {
        throw new Error("xAI returned no message content");
      }
      // Parse through Zod so downstream code gets a validated, typed object.
      return schema.parse(JSON.parse(raw)) as z.infer<T>;
    },

    async text(system, user, opts = {}) {
      const data = await call(
        "/chat/completions",
        {
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: opts.temperature ?? 0.9,
          max_tokens: opts.maxTokens ?? 400,
        },
        apiKey,
      );
      return data?.choices?.[0]?.message?.content ?? "";
    },

    async image(prompt, { n = 2 } = {}) {
      // Request bytes rather than URLs. Grok Imagine's hosted URLs are marked
      // temporary (`xai-tmp-imgen-…`), and an image that 404s partway through a
      // demo is worse than a slightly heavier payload.
      const data = await call(
        "/images/generations",
        { model: IMAGE_MODEL, prompt, n, response_format: "b64_json" },
        apiKey,
      );
      const items: any[] = data?.data ?? [];
      return items.map<ImageResult>((d) => ({
        url: d.b64_json
          ? `data:${d.mime_type ?? "image/jpeg"};base64,${d.b64_json}`
          : d.url,
        // Grok Imagine may return a revised version of our prompt — keep that,
        // since it's what actually produced the image.
        prompt: d.revised_prompt ?? prompt,
        provider: "grok_imagine",
      }));
    },
  };
}
