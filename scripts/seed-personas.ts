/**
 * Seeds the persona library: generates diverse personas in batches of 20 via
 * the generator model and inserts them with source 'seed'.
 *
 *   pnpm seed-personas                      # 120 personas, real API
 *   pnpm exec tsx scripts/seed-personas.ts --mock --count 40   # mock LLM
 *
 * Flags:
 *   --count N   total personas to generate (default 120)
 *   --append    skip the ≥100-active-personas guard
 *   --mock      set MOCK_LLM=1 before loading the LLM client
 *
 * Guard: if the table already holds ≥100 active personas and --append is not
 * given, warns and exits 0 (idempotent-ish, per docs/contracts.md).
 */

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function intArg(name: string, fallback: number): number {
  const i = args.indexOf(name);
  if (i === -1 || i === args.length - 1) return fallback;
  const n = Number.parseInt(args[i + 1], 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error(`Invalid value for ${name}: ${args[i + 1]}`);
    process.exit(1);
  }
  return n;
}

if (flag("--mock")) process.env.MOCK_LLM = "1";

const BATCH_SIZE = 20;

/** Archetype families rotated across batches. The generator picks its own
 * specific labels within each family. */
const ARCHETYPE_FAMILIES = [
  "early-adopter techie",
  "budget-conscious parent",
  "skeptical retiree",
  "small-business owner",
  "status-seeking professional",
  "frugal student",
  "rural pragmatist",
  "urban creative",
  "corporate middle manager",
  "health-anxious senior",
  "gig worker",
  "civic-minded teacher",
];

/** Split a batch of `size` across 4 rotating families, e.g. "5 x budget-conscious parent, ...". */
function quotaForBatch(batchIndex: number, size: number): string {
  const familiesPerBatch = 4;
  const start = (batchIndex * familiesPerBatch) % ARCHETYPE_FAMILIES.length;
  const families = Array.from(
    { length: familiesPerBatch },
    (_, i) => ARCHETYPE_FAMILIES[(start + i) % ARCHETYPE_FAMILIES.length],
  );
  const base = Math.floor(size / familiesPerBatch);
  const remainder = size % familiesPerBatch;
  return families
    .map((family, i) => `- ${base + (i < remainder ? 1 : 0)} × ${family}`)
    .filter((line) => !line.startsWith("- 0 "))
    .join("\n");
}

async function main() {
  const totalCount = intArg("--count", 120);
  const append = flag("--append");

  // Dynamic imports AFTER the env is set so MOCK_LLM applies to the client.
  const [{ db, personas }, { generate, isMock }, { GeneratedPersonaBatchSchema }, prompts, { sql }, { nanoid }] =
    await Promise.all([
      import("../src/lib/db/index"),
      import("../src/lib/llm/client"),
      import("../src/lib/schemas/persona-gen"),
      import("../src/lib/prompts/persona-gen"),
      import("drizzle-orm"),
      import("nanoid"),
    ]);

  const [{ count: activeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(personas)
    .where(sql`${personas.active} = true`);

  if (activeCount >= 100 && !append) {
    console.warn(
      `Library already has ${activeCount} active personas (≥100). ` +
        `Refusing to seed again — pass --append to add more anyway.`,
    );
    process.exit(0);
  }

  console.log(
    `Seeding ${totalCount} personas in batches of ${BATCH_SIZE}` +
      `${isMock() ? " (MOCK_LLM=1)" : ""} — ${activeCount} active personas already in the table.`,
  );

  // Exclusion lists start from what's already in the DB and grow per batch.
  const existing = await db
    .select({ name: personas.name, demographics: personas.demographics })
    .from(personas);
  const usedNames = new Set<string>(existing.map((p) => p.name));
  const usedOccupations = new Set<string>(existing.map((p) => p.demographics.occupation));

  // The model may return fewer personas than asked (the mock adapter returns
  // ~2 per call), so loop until the target is reached rather than assuming
  // full batches.
  let inserted = 0;
  let batch = 0;

  while (inserted < totalCount) {
    const size = Math.min(BATCH_SIZE, totalCount - inserted);
    const quota = quotaForBatch(batch, size);
    console.log(`\nBatch ${batch + 1} (requesting ${size} personas):\n${quota}`);

    const prompt = prompts.buildPersonaBatchPrompt({
      count: size,
      archetypeQuota: quota,
      // Cap exclusion lists to keep the prompt bounded as the library grows.
      usedNames: [...usedNames].slice(-400),
      usedOccupations: [...usedOccupations].slice(-400),
    });

    const result = await generate({
      role: "generator",
      schema: GeneratedPersonaBatchSchema,
      system: prompts.PERSONA_GEN_SYSTEM,
      prompt,
    });

    const rows = result.object.personas.slice(0, size).map((p) => ({
      name: p.name,
      archetype: p.archetype,
      demographics: p.demographics,
      psychographics: p.psychographics,
      backstory: p.backstory,
      tags: p.tags,
      avatarSeed: nanoid(),
      source: "seed" as const,
    }));

    if (rows.length === 0) {
      console.error("  ✗ model returned 0 personas — aborting to avoid an infinite loop.");
      process.exit(1);
    }

    await db.insert(personas).values(rows);
    inserted += rows.length;
    batch += 1;
    for (const p of result.object.personas) {
      usedNames.add(p.name);
      usedOccupations.add(p.demographics.occupation);
    }
    console.log(
      `  ✓ inserted ${rows.length} (total ${inserted}/${totalCount}, ` +
        `${result.inputTokens} in / ${result.outputTokens} out tokens, ${result.model})`,
    );
  }

  console.log(`\nDone: ${inserted} personas seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
