/**
 * End-to-end smoke test for the validation-pipeline engine.
 *
 *   pnpm smoke-run --mock                  # full mock pipeline, quick tier
 *   pnpm smoke-run --mock --tier standard  # explicit tier
 *   pnpm smoke-run --mock --fixture        # also writes src/fixtures/run-fixture.json
 *
 * Seeds ~30 synthetic personas when the table is empty, starts a run, follows
 * the live event stream, and asserts the run completed with a coherent event
 * log and terminal agent rows. Exits 1 on any failure.
 */

import fs from "node:fs";
import path from "node:path";

// ---- CLI args (before any engine import so --mock can set env first) -------

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const optValue = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

const mock = hasFlag("mock");
const fixture = hasFlag("fixture");
// The fixture contract wants a completed mock Standard run; otherwise default quick.
const tier = optValue("tier") ?? (fixture ? "standard" : "quick");

if (!["quick", "standard", "deep"].includes(tier)) {
  console.error(`invalid --tier ${tier} (expected quick|standard|deep)`);
  process.exit(1);
}
if (mock) process.env.MOCK_LLM = "1";

const SAMPLE_IDEA =
  "Sprout: a subscription plant-care app that pairs a $6/month plan with smart reminders, " +
  "photo-based plant health diagnosis, and a mail-order 'rescue kit' (soil, treatment, tools) " +
  "dispatched automatically when the app detects a struggling plant.";

const TIMEOUT_MS = 5 * 60 * 1000;

// ---- Synthetic persona fixtures --------------------------------------------

interface SeedTuple {
  name: string;
  age: number;
  gender: string;
  location: string;
  income: "low" | "lower_middle" | "middle" | "upper_middle" | "high";
  education: string;
  occupation: string;
  archetype: string;
  psycho: [tech: number, risk: number, price: number, open: number];
  values: string[];
  tags: string[];
}

const SEED_PERSONAS: SeedTuple[] = [
  { name: "Maya Thompson", age: 29, gender: "female", location: "Austin, USA", income: "middle", education: "BA Marketing", occupation: "Social media manager", archetype: "Trend-chasing early adopter", psycho: [5, 4, 2, 5], values: ["novelty", "aesthetics", "community"], tags: ["urban", "millennial", "plant-owner"] },
  { name: "Raj Patel", age: 41, gender: "male", location: "Leicester, UK", income: "upper_middle", education: "MSc Finance", occupation: "Accountant", archetype: "Spreadsheet skeptic", psycho: [3, 2, 5, 2], values: ["value-for-money", "reliability", "family"], tags: ["suburban", "budget-conscious"] },
  { name: "Elena Petrova", age: 34, gender: "female", location: "Berlin, Germany", income: "middle", education: "Diplom Design", occupation: "Freelance illustrator", archetype: "Aesthetic-first creative", psycho: [4, 3, 4, 5], values: ["beauty", "independence", "sustainability"], tags: ["creative", "freelancer"] },
  { name: "Marcus Johnson", age: 52, gender: "male", location: "Detroit, USA", income: "lower_middle", education: "High school", occupation: "Auto technician", archetype: "Practical no-frills buyer", psycho: [2, 2, 5, 2], values: ["durability", "honesty", "hard work"], tags: ["blue-collar", "pragmatic"] },
  { name: "Aiko Tanaka", age: 26, gender: "female", location: "Osaka, Japan", income: "middle", education: "BSc Biology", occupation: "Lab technician", archetype: "Methodical researcher", psycho: [4, 2, 4, 3], values: ["precision", "learning", "calm"], tags: ["scientific", "introvert"] },
  { name: "Diego Ramirez", age: 38, gender: "male", location: "Mexico City, Mexico", income: "middle", education: "BEng Civil", occupation: "Construction manager", archetype: "Time-starved parent", psycho: [3, 3, 4, 3], values: ["family", "efficiency", "loyalty"], tags: ["parent", "busy"] },
  { name: "Sarah O'Brien", age: 67, gender: "female", location: "Cork, Ireland", income: "middle", education: "BA English", occupation: "Retired teacher", archetype: "Cautious traditionalist", psycho: [2, 1, 4, 2], values: ["tradition", "community", "thrift"], tags: ["retiree", "gardener"] },
  { name: "Kwame Mensah", age: 31, gender: "male", location: "Accra, Ghana", income: "lower_middle", education: "BSc Computer Science", occupation: "Startup developer", archetype: "Scrappy optimizer", psycho: [5, 4, 5, 4], values: ["growth", "resourcefulness", "ambition"], tags: ["tech", "emerging-market"] },
  { name: "Ingrid Larsen", age: 45, gender: "female", location: "Oslo, Norway", income: "high", education: "MBA", occupation: "Product director", archetype: "Premium convenience seeker", psycho: [4, 3, 1, 4], values: ["quality", "time", "design"], tags: ["executive", "high-income"] },
  { name: "Tom Wheeler", age: 58, gender: "male", location: "Boise, USA", income: "middle", education: "AA Horticulture", occupation: "Nursery owner", archetype: "Domain-expert gatekeeper", psycho: [2, 2, 3, 2], values: ["expertise", "nature", "independence"], tags: ["expert", "small-business"] },
  { name: "Priya Sharma", age: 24, gender: "female", location: "Bangalore, India", income: "lower_middle", education: "BTech", occupation: "QA engineer", archetype: "Deal-hunting digital native", psycho: [5, 3, 5, 4], values: ["savings", "status", "connection"], tags: ["gen-z", "mobile-first"] },
  { name: "Hans Becker", age: 49, gender: "male", location: "Munich, Germany", income: "upper_middle", education: "PhD Chemistry", occupation: "R&D scientist", archetype: "Evidence-demanding skeptic", psycho: [4, 2, 3, 2], values: ["rigor", "privacy", "durability"], tags: ["skeptic", "privacy-minded"] },
  { name: "Fatima Al-Rashid", age: 36, gender: "female", location: "Dubai, UAE", income: "high", education: "MA Interior Design", occupation: "Interior designer", archetype: "Image-conscious curator", psycho: [4, 3, 1, 4], values: ["luxury", "presentation", "hospitality"], tags: ["design", "premium"] },
  { name: "Liam Murphy", age: 22, gender: "male", location: "Melbourne, Australia", income: "low", education: "Undergraduate", occupation: "University student", archetype: "Broke experimenter", psycho: [5, 4, 5, 5], values: ["fun", "friends", "flexibility"], tags: ["student", "budget"] },
  { name: "Grace Nakamura", age: 43, gender: "female", location: "Seattle, USA", income: "upper_middle", education: "MS Computer Science", occupation: "Engineering manager", archetype: "Busy pragmatic techie", psycho: [5, 3, 2, 3], values: ["efficiency", "family", "craft"], tags: ["tech", "parent"] },
  { name: "Omar Haddad", age: 55, gender: "male", location: "Amman, Jordan", income: "middle", education: "BA Business", occupation: "Restaurant owner", archetype: "Relationship-first buyer", psycho: [2, 3, 4, 3], values: ["hospitality", "trust", "family"], tags: ["small-business", "traditional"] },
  { name: "Chloe Dubois", age: 28, gender: "female", location: "Lyon, France", income: "middle", education: "MSc Environmental Science", occupation: "Sustainability consultant", archetype: "Ethics-driven purchaser", psycho: [4, 3, 3, 4], values: ["sustainability", "transparency", "minimalism"], tags: ["eco", "urban"] },
  { name: "Viktor Kovac", age: 62, gender: "male", location: "Prague, Czechia", income: "lower_middle", education: "Vocational", occupation: "Retired machinist", archetype: "Fixed-income frugalist", psycho: [1, 1, 5, 1], values: ["thrift", "self-reliance", "routine"], tags: ["retiree", "low-tech"] },
  { name: "Jasmine Carter", age: 33, gender: "female", location: "Atlanta, USA", income: "middle", education: "BSN Nursing", occupation: "ER nurse", archetype: "No-time-to-waste caregiver", psycho: [3, 2, 4, 3], values: ["care", "practicality", "rest"], tags: ["healthcare", "shift-worker"] },
  { name: "Sven Eriksson", age: 39, gender: "male", location: "Stockholm, Sweden", income: "high", education: "MSc Engineering", occupation: "Fintech founder", archetype: "Contrarian operator", psycho: [5, 5, 2, 4], values: ["autonomy", "speed", "candor"], tags: ["founder", "contrarian"] },
  { name: "Rosa Delgado", age: 47, gender: "female", location: "Madrid, Spain", income: "middle", education: "BA Education", occupation: "Primary school teacher", archetype: "Community-minded nurturer", psycho: [3, 2, 4, 3], values: ["children", "community", "patience"], tags: ["teacher", "parent"] },
  { name: "Ahmed Hassan", age: 30, gender: "male", location: "Cairo, Egypt", income: "lower_middle", education: "BCom", occupation: "Bank teller", archetype: "Aspirational saver", psycho: [3, 2, 5, 3], values: ["stability", "family", "progress"], tags: ["saver", "urban"] },
  { name: "Emily Zhang", age: 27, gender: "female", location: "Vancouver, Canada", income: "middle", education: "BFA", occupation: "UX designer", archetype: "Design-literate critic", psycho: [5, 3, 3, 4], values: ["usability", "craft", "wellness"], tags: ["design", "critical"] },
  { name: "Bruno Ferreira", age: 44, gender: "male", location: "São Paulo, Brazil", income: "upper_middle", education: "MBA", occupation: "Sales director", archetype: "Charismatic status buyer", psycho: [3, 4, 2, 4], values: ["status", "network", "energy"], tags: ["sales", "extrovert"] },
  { name: "Nadia Osman", age: 35, gender: "female", location: "Nairobi, Kenya", income: "middle", education: "MPH", occupation: "NGO program manager", archetype: "Impact-weighing realist", psycho: [4, 3, 4, 4], values: ["impact", "equity", "evidence"], tags: ["ngo", "pragmatic"] },
  { name: "Peter Novak", age: 51, gender: "male", location: "Chicago, USA", income: "upper_middle", education: "JD", occupation: "Corporate lawyer", archetype: "Risk-averse fine-print reader", psycho: [3, 1, 3, 2], values: ["security", "precision", "reputation"], tags: ["lawyer", "cautious"] },
  { name: "Sofia Rossi", age: 25, gender: "female", location: "Milan, Italy", income: "lower_middle", education: "BA Fashion", occupation: "Retail associate", archetype: "Trend-aware budget stylist", psycho: [4, 3, 5, 4], values: ["style", "friends", "experiences"], tags: ["gen-z", "retail"] },
  { name: "David Kim", age: 40, gender: "male", location: "Seoul, South Korea", income: "high", education: "MS Data Science", occupation: "Quant analyst", archetype: "Data-demanding optimizer", psycho: [5, 3, 3, 3], values: ["data", "efficiency", "health"], tags: ["quant", "analytical"] },
  { name: "Margaret Hughes", age: 71, gender: "female", location: "Cardiff, UK", income: "lower_middle", education: "Secondary school", occupation: "Retired shop clerk", archetype: "Late-adopting loyalist", psycho: [1, 1, 5, 2], values: ["loyalty", "simplicity", "garden"], tags: ["senior", "gardener"] },
  { name: "Carlos Mendoza", age: 37, gender: "male", location: "Bogotá, Colombia", income: "middle", education: "BEng Systems", occupation: "IT support lead", archetype: "Helpful cautious adopter", psycho: [4, 2, 4, 3], values: ["service", "stability", "learning"], tags: ["it", "helper"] },
];

function backstoryFor(p: SeedTuple): string {
  return (
    `${p.name} is a ${p.age}-year-old ${p.occupation.toLowerCase()} in ${p.location}. ` +
    `Day to day they juggle work and life as a ${p.archetype.toLowerCase()}, caring most about ${p.values.join(", ")}. ` +
    `They decide on new products slowly when price sensitivity (${p.psycho[2]}/5) bites, and their tech comfort is ${p.psycho[0]}/5. ` +
    `Their media diet and social circle reflect a ${p.income.replace("_", " ")} income household.`
  );
}

// ---- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const { nanoid } = await import("nanoid");
  const { asc, eq } = await import("drizzle-orm");
  const { db, personas, runs, agentRuns, runEvents } = await import("../src/lib/db/index");
  const { estimateRunCost } = await import("../src/lib/llm/cost");
  const { subscribeToRun } = await import("../src/lib/engine/events");
  const { startRun } = await import("../src/lib/engine/orchestrator");
  type RunTier = import("../src/lib/db/schema").RunTier;

  const fail = (msg: string): never => {
    console.error(`\nSMOKE FAILED: ${msg}`);
    process.exit(1);
  };

  // 1. Seed personas when the table is empty.
  const existing = await db.select({ id: personas.id }).from(personas).limit(1);
  if (existing.length === 0) {
    console.log(`Seeding ${SEED_PERSONAS.length} synthetic personas…`);
    await db.insert(personas).values(
      SEED_PERSONAS.map((p) => ({
        name: p.name,
        archetype: p.archetype,
        demographics: {
          age: p.age,
          gender: p.gender,
          location: p.location,
          incomeBand: p.income,
          education: p.education,
          occupation: p.occupation,
        },
        psychographics: {
          techSavviness: p.psycho[0],
          riskTolerance: p.psycho[1],
          priceSensitivity: p.psycho[2],
          openness: p.psycho[3],
          values: p.values,
          spendingHabits: `Typical ${p.income.replace("_", " ")}-income spender: ${p.psycho[2] >= 4 ? "compares prices and waits for discounts" : "pays for quality and convenience"}.`,
        },
        backstory: backstoryFor(p),
        avatarSeed: nanoid(),
        tags: p.tags,
        source: "seed" as const,
        active: true,
      })),
    );
  }

  // 2. Create the run row.
  const [runRow] = await db
    .insert(runs)
    .values({
      idea: SAMPLE_IDEA,
      context: "Target launch: US + EU app stores. Team of 2, pre-seed.",
      tier: tier as RunTier,
      grounding: false,
      status: "pending",
      estCostUsd: estimateRunCost(tier as RunTier, false).toFixed(4),
    })
    .returning();
  const runId = runRow.id;
  console.log(`Run ${runId} created (tier=${tier}, mock=${mock})`);

  // 3. Follow the live event stream.
  const liveSeqs: number[] = [];
  let terminalResolve!: (status: string) => void;
  const terminal = new Promise<string>((resolve) => (terminalResolve = resolve));

  const unsubscribe = subscribeToRun(runId, (event) => {
    liveSeqs.push(event.seq);
    const p = event.payload as Record<string, unknown>;
    const detail =
      event.type === "run:status"
        ? String(p.status) + (p.error ? ` (${p.error})` : "")
        : event.type.startsWith("stage:")
          ? `${p.stage}${p.agentCount !== undefined ? ` ×${p.agentCount}` : ""}`
          : event.type.startsWith("agent:")
            ? `${p.kind} · ${p.label}${p.error ? ` (${p.error})` : ""}`
            : `$${Number(p.totalUsd).toFixed(4)}`;
    console.log(`  [${String(event.seq).padStart(3)}] ${event.type.padEnd(15)} ${detail}`);
    if (
      event.type === "run:status" &&
      ["completed", "failed", "cancelled"].includes(String(p.status))
    ) {
      terminalResolve(String(p.status));
    }
  });

  // 4. Start and wait for a terminal status.
  startRun(runId);
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS));
  const finalStatus = await Promise.race([terminal, timeout]);
  unsubscribe();
  if (finalStatus === "timeout") fail(`run did not reach a terminal status in ${TIMEOUT_MS}ms`);

  // 5. Assertions.
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (run.status !== "completed") fail(`run status is ${run.status} (error: ${run.error})`);
  if (!run.brief) fail("run.brief is missing");
  if (!run.aggregates) fail("run.aggregates is missing");
  if (!run.synthesis) fail("run.synthesis is missing");
  if (!run.actualCostUsd) fail("run.actualCostUsd is missing");

  const agents = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.runId, runId))
    .orderBy(asc(agentRuns.createdAt));
  if (agents.length === 0) fail("no agent_runs rows were written");
  const nonTerminal = agents.filter((a) => !["completed", "failed", "skipped"].includes(a.status));
  if (nonTerminal.length > 0) {
    fail(`non-terminal agent_runs: ${nonTerminal.map((a) => `${a.label}=${a.status}`).join(", ")}`);
  }

  const eventRows = await db
    .select({ seq: runEvents.seq })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));
  eventRows.forEach((row, i) => {
    if (row.seq !== i + 1) fail(`event seq not strictly monotonic from 1: index ${i} has seq ${row.seq}`);
  });
  const sortedLive = [...liveSeqs].sort((a, b) => a - b);
  sortedLive.forEach((seq, i) => {
    if (seq !== i + 1) fail(`live event stream has gaps/dupes: position ${i} has seq ${seq}`);
  });

  console.log(
    `\nSMOKE OK: run completed · ${agents.length} agents (${agents.filter((a) => a.status === "completed").length} completed, ${agents.filter((a) => a.status === "failed").length} failed) · ${eventRows.length} events monotonic from 1 · cost $${run.actualCostUsd}`,
  );

  // 6. Optional fixture in the exact GET /api/runs/[runId] snapshot shape.
  if (fixture) {
    const personaIds = [...new Set(agents.map((a) => a.personaId).filter((id): id is string => !!id))];
    const personaRows = personaIds.length
      ? await db.select().from(personas)
      : [];
    const personaMap: Record<string, { id: string; name: string; archetype: string; avatarSeed: string }> = {};
    for (const p of personaRows) {
      if (personaIds.includes(p.id)) {
        personaMap[p.id] = { id: p.id, name: p.name, archetype: p.archetype, avatarSeed: p.avatarSeed };
      }
    }
    const fixturePath = path.join(process.cwd(), "src", "fixtures", "run-fixture.json");
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({ run, agents, personas: personaMap }, null, 2) + "\n",
    );
    console.log(`Fixture written: ${fixturePath} (${personaIds.length} personas)`);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("\nSMOKE FAILED:", error);
  process.exit(1);
});
