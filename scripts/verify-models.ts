/**
 * Verifies every model ID in the registry resolves against the live xAI API.
 * Run before the first real-API session and whenever xAI restructures models:
 *   pnpm verify-models
 */
import { MODELS } from "../src/lib/llm/models";

async function main() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("XAI_API_KEY is not set");
    process.exit(1);
  }

  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error(`GET /v1/models failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const body = (await res.json()) as { data: Array<{ id: string }> };
  const available = new Set(body.data.map((m) => m.id));

  console.log(`xAI reports ${available.size} models:`);
  for (const id of [...available].sort()) console.log(`  ${id}`);

  let ok = true;
  for (const [role, info] of Object.entries(MODELS)) {
    if (available.has(info.id)) {
      console.log(`✓ ${role}: ${info.id}`);
    } else {
      console.error(`✗ ${role}: ${info.id} NOT FOUND — update src/lib/llm/models.ts`);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
}

main();
