/**
 * Seeds the persona library pool-by-pool: for every subdomain in the taxonomy
 * (src/lib/personas/taxonomy.ts) it generates personas in batches until the
 * pool reaches its target, inserting them with the pool's domain/subdomain
 * and source 'seed'.
 *
 *   pnpm seed-personas                                    # 12/pool, real API (22 pools → 264)
 *   pnpm exec tsx scripts/seed-personas.ts --mock --per-pool 4
 *   pnpm exec tsx scripts/seed-personas.ts --per-pool 25  # full ~550-persona library
 *   pnpm exec tsx scripts/seed-personas.ts --pool consumers/budget-households --per-pool 25
 *
 * Flags:
 *   --per-pool N   target active personas per pool (default 12)
 *   --pool D/S     seed only this pool (e.g. consumers/budget-households)
 *   --append       grow pools by N even if they already meet the target
 *   --mock         set MOCK_LLM=1 before loading the LLM client
 *
 * Guard: pools already at/above the target are skipped (reported, exit 0)
 * unless --append is given, which adds N more to every selected pool.
 */

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function strArg(name: string): string | null {
  const i = args.indexOf(name);
  return i === -1 || i === args.length - 1 ? null : args[i + 1];
}

function intArg(name: string, fallback: number): number {
  const raw = strArg(name);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error(`Invalid value for ${name}: ${raw}`);
    process.exit(1);
  }
  return n;
}

if (flag("--mock")) process.env.MOCK_LLM = "1";

const MAX_BATCH = 15;
/** Hard cap on generator calls per pool, so a degenerate model can't loop forever. */
const MAX_BATCHES_PER_POOL = 25;

async function main() {
  const perPool = intArg("--per-pool", 12);
  const onlyPool = strArg("--pool");
  const append = flag("--append");

  // Dynamic imports AFTER the env is set so MOCK_LLM applies to the client.
  const [
    { db, personas },
    { generate, isMock },
    { GeneratedPersonaBatchSchema },
    prompts,
    { allSubdomains },
    { and, eq, sql },
    { nanoid },
  ] = await Promise.all([
    import("../src/lib/db/index"),
    import("../src/lib/llm/client"),
    import("../src/lib/schemas/persona-gen"),
    import("../src/lib/prompts/persona-gen"),
    import("../src/lib/personas/taxonomy"),
    import("drizzle-orm"),
    import("nanoid"),
  ]);

  let pools = allSubdomains();
  if (onlyPool) {
    pools = pools.filter((s) => `${s.domainKey}/${s.key}` === onlyPool);
    if (pools.length === 0) {
      console.error(
        `Unknown pool "${onlyPool}". Valid pools:\n` +
          allSubdomains()
            .map((s) => `  ${s.domainKey}/${s.key}`)
            .join("\n"),
      );
      process.exit(1);
    }
  }

  console.log(
    `Seeding ${pools.length} pool(s) to ${append ? `+${perPool} each (--append)` : `${perPool} personas each`}` +
      `${isMock() ? " (MOCK_LLM=1)" : ""}.`,
  );

  // Exclusion lists start from what's already in the DB and grow per batch.
  const existing = await db
    .select({ name: personas.name, demographics: personas.demographics })
    .from(personas);
  const usedNames = new Set<string>(existing.map((p) => p.name));
  const usedOccupations = new Set<string>(existing.map((p) => p.demographics.occupation));

  const report: Array<{ pool: string; before: number; added: number; after: number }> = [];
  let totalAdded = 0;

  for (const sub of pools) {
    const poolLabel = `${sub.domainKey}/${sub.key}`;
    const [{ count: before }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(personas)
      .where(
        and(
          eq(personas.active, true),
          eq(personas.domain, sub.domainKey),
          eq(personas.subdomain, sub.key),
        ),
      );

    const target = append ? before + perPool : perPool;
    if (before >= target) {
      console.log(`\n${poolLabel}: ${before}/${perPool} — already at target, skipping.`);
      report.push({ pool: poolLabel, before, added: 0, after: before });
      continue;
    }

    // Tags already in the pool feed the prompt so casting labels stay coherent.
    const poolRows = await db
      .select({ tags: personas.tags })
      .from(personas)
      .where(and(eq(personas.domain, sub.domainKey), eq(personas.subdomain, sub.key)));
    const poolTags = new Set<string>(poolRows.flatMap((r) => r.tags));

    console.log(`\n${poolLabel}: ${before} → ${target}`);

    // The model may return fewer personas than asked (the mock adapter returns
    // ~2 per call), so loop until the pool target is reached.
    let added = 0;
    let batches = 0;
    while (before + added < target && batches < MAX_BATCHES_PER_POOL) {
      const size = Math.min(MAX_BATCH, target - before - added);
      const result = await generate({
        role: "generator",
        schema: GeneratedPersonaBatchSchema,
        system: prompts.PERSONA_GEN_SYSTEM,
        prompt: prompts.buildPersonaBatchPrompt({
          count: size,
          pool: {
            domainKey: sub.domainKey,
            subdomainKey: sub.key,
            name: sub.name,
            description: sub.description,
            seedHints: sub.seedHints,
          },
          // Cap exclusion lists to keep the prompt bounded as the library grows.
          usedNames: [...usedNames].slice(-400),
          usedOccupations: [...usedOccupations].slice(-400),
          poolTags: [...poolTags].slice(-60),
        }),
      });

      const batch = result.object.personas.slice(0, size);
      if (batch.length === 0) {
        console.error(`  ✗ model returned 0 personas for ${poolLabel} — moving on.`);
        break;
      }

      await db.insert(personas).values(
        batch.map((p) => ({
          ...p,
          domain: sub.domainKey,
          subdomain: sub.key,
          avatarSeed: nanoid(),
          source: "seed" as const,
        })),
      );

      added += batch.length;
      batches += 1;
      for (const p of batch) {
        usedNames.add(p.name);
        usedOccupations.add(p.demographics.occupation);
        for (const t of p.tags) poolTags.add(t);
      }
      console.log(
        `  ✓ batch ${batches}: +${batch.length} (${before + added}/${target}, ` +
          `${result.inputTokens} in / ${result.outputTokens} out tokens, ${result.model})`,
      );
    }

    totalAdded += added;
    report.push({ pool: poolLabel, before, added, after: before + added });
  }

  const width = Math.max(...report.map((r) => r.pool.length));
  console.log(`\nPer-pool report:`);
  for (const r of report) {
    console.log(
      `  ${r.pool.padEnd(width)}  ${String(r.before).padStart(3)} → ${String(r.after).padStart(3)}` +
        (r.added > 0 ? `  (+${r.added})` : "  (skipped)"),
    );
  }
  console.log(`\nDone: ${totalAdded} personas seeded across ${pools.length} pool(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
