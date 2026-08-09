/**
 * Deterministic offline provider.
 *
 * Hand-authored generators keyed by `opts.task`, all driven by a seeded RNG.
 * Same seed + same brief always yields the same campaign, which is what makes
 * the demo rehearsable. Content is templated from the user's actual brief, so
 * it reads as specific to their product rather than as lorem ipsum.
 */
import { z } from "zod";
import type { GenerateOptions, ImageResult, LlmProvider } from "./provider";
import { hashSeed, makeRng, type Rng } from "./rng";

// ---------------------------------------------------------------------------
// Content banks
// ---------------------------------------------------------------------------

const COHORT_BLUEPRINTS = [
  {
    name: "Pragmatic Evaluators",
    color: "#3b82f6",
    description:
      "Compare options methodically, read documentation before pricing, and want proof before enthusiasm.",
    interests: ["tooling comparisons", "benchmarks", "workflow efficiency"],
    values: ["reliability", "transparency", "time saved"],
    objections: ["unclear pricing", "vendor lock-in", "yet another tool"],
    triggers: ["a concrete before/after", "free tier with real limits", "peer endorsement"],
    baseline: { humor: 0.3, skepticism: 0.75, influence: 0.5, persuadability: 0.45 },
    media: ["x", "reddit", "web"] as const,
  },
  {
    name: "Momentum Builders",
    color: "#f59e0b",
    description:
      "Early adopters who share what they find. Enthusiasm is their currency and speed is their bias.",
    interests: ["new launches", "build-in-public", "productivity hacks"],
    values: ["novelty", "craft", "being early"],
    objections: ["feels derivative", "no personality", "closed beta friction"],
    triggers: ["a striking demo", "founder story", "invite access"],
    baseline: { humor: 0.7, skepticism: 0.35, influence: 0.78, persuadability: 0.65 },
    media: ["x", "instagram", "tiktok"] as const,
  },
  {
    name: "Budget Guardians",
    color: "#10b981",
    description:
      "Hold the purse strings. Care about total cost, switching cost, and whether this survives next quarter.",
    interests: ["ROI", "consolidation", "procurement"],
    values: ["predictability", "accountability", "value"],
    objections: ["price", "another subscription", "unproven company"],
    triggers: ["clear ROI math", "annual discount", "case study with numbers"],
    baseline: { humor: 0.25, skepticism: 0.8, influence: 0.55, persuadability: 0.35 },
    media: ["linkedin", "email", "web"] as const,
  },
  {
    name: "Craft Purists",
    color: "#a855f7",
    description:
      "Judge on taste and detail. Allergic to hype language and quick to call out anything that feels synthetic.",
    interests: ["design systems", "typography", "product detail"],
    values: ["taste", "restraint", "authenticity"],
    objections: ["marketing speak", "AI slop", "over-promising"],
    triggers: ["evident craft", "understated proof", "respect for the reader"],
    baseline: { humor: 0.5, skepticism: 0.7, influence: 0.6, persuadability: 0.4 },
    media: ["x", "instagram", "web"] as const,
  },
  {
    name: "Curious Skimmers",
    color: "#ec4899",
    description:
      "Large, low-intent, high-volume. Scroll fast, react on instinct, and amplify anything that lands.",
    interests: ["memes", "trends", "quick wins"],
    values: ["entertainment", "relatability", "low effort"],
    objections: ["too long", "too technical", "boring"],
    triggers: ["a good hook", "humor", "social proof at scale"],
    baseline: { humor: 0.85, skepticism: 0.3, influence: 0.35, persuadability: 0.7 },
    media: ["x", "tiktok", "instagram"] as const,
  },
];

// Persona names live in `src/lib/audience.ts` — the mock only designs cohorts,
// and the population is sampled from them there.

const TENSIONS = [
  "Buyers say they want AI features but distrust AI-generated output.",
  "Teams are consolidating tools, so new entrants must displace rather than add.",
  "Public sentiment rewards candour about limitations more than polish.",
  "Pricing pages that hide numbers generate measurable backlash.",
  "Founder-led content outperforms brand accounts but does not scale.",
];

const THEME_ANGLES: Record<string, { name: string; thesis: string; direction: string; accent: string }> = {
  memes: {
    name: "The Inside Joke",
    thesis:
      "Win attention by naming the absurd daily frustration your product removes, in the audience's own vernacular.",
    direction:
      "High-contrast, low-polish. Screenshot-native. Reaction-image energy with one earnest beat at the end.",
    accent: "#f59e0b",
  },
  founder_led: {
    name: "Built In Public",
    thesis:
      "Trust transfers from a named person faster than from a brand. Lead with the maker and the decisions behind the product.",
    direction:
      "Documentary and unpolished. Real screenshots, real numbers, first-person voice, visible seams.",
    accent: "#3b82f6",
  },
  direct_response: {
    name: "The Straight Offer",
    thesis:
      "Skip persuasion theatre. State the outcome, the price, and the next step in the first line.",
    direction:
      "Clean, typographic, benefit-forward. One claim per asset, always paired with a concrete number.",
    accent: "#10b981",
  },
  educational: {
    name: "Teach The Problem",
    thesis:
      "Earn the sale by making the audience smarter about the problem, then position the product as the obvious consequence.",
    direction:
      "Diagram-heavy, calm palette, carousel and thread native. Explain first, sell in the last frame.",
    accent: "#8b5cf6",
  },
  aspirational: {
    name: "The Better Default",
    thesis:
      "Sell the identity of the person who already solved this, and make the product the visible marker of that status.",
    direction:
      "Cinematic, restrained, generous whitespace. Product as artefact rather than as interface.",
    accent: "#ec4899",
  },
  serious: {
    name: "The Considered Case",
    thesis:
      "Treat the reader as a professional making a consequential decision. Precision signals competence.",
    direction:
      "Editorial and sober. Data visualisation, muted palette, long-form structure, no exclamation marks.",
    accent: "#64748b",
  },
};

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

type Ctx = Record<string, unknown>;

function brief(ctx: Ctx) {
  const b = (ctx.brief ?? {}) as any;
  return {
    productName: b.productName ?? "the product",
    productDescription: b.productDescription ?? "a new product",
    objective: b.objective ?? "drive launch awareness",
    targetMarket: b.targetMarket ?? "early-stage software teams",
    themes: (b.themes ?? ["direct_response", "founder_led", "memes"]) as string[],
    platforms: (b.platforms ?? ["x", "instagram"]) as string[],
    launchDate: b.launchDate ?? new Date().toISOString().slice(0, 10),
  };
}

function genResearch(rng: Rng, ctx: Ctx) {
  const b = brief(ctx);
  const findings = Array.from({ length: 6 }, (_, i) => ({
    id: `f_${i}`,
    source: rng.pick(["x_search", "web_search", "grok_synthesis"] as const),
    title: rng.pick([
      `Recurring complaint about ${b.targetMarket} tooling`,
      `Pricing sensitivity in the ${b.productName} category`,
      `What ${b.targetMarket} actually share publicly`,
      `Competitor positioning gap`,
      `Vocabulary shift in category discourse`,
      `Trust signals that move this audience`,
    ]),
    summary: rng.pick([
      "Aggregate discussion shows repeated frustration with setup time over feature depth.",
      "Threads cluster around switching cost rather than sticker price.",
      "Posts that show real output outperform posts that describe capability.",
      "Audience reacts negatively to unqualified superlatives; qualified claims travel further.",
      "Category vocabulary has shifted away from 'platform' toward specific verbs.",
    ]),
    sentiment: Number((rng.next() * 1.4 - 0.6).toFixed(2)),
    salience: Number(rng.around(0.6).toFixed(2)),
    tags: rng.sample(["pricing", "trust", "onboarding", "competition", "tone", "proof"], 2),
  }));

  return {
    category: `${b.targetMarket} · ${b.productName} category`,
    categorySummary: `Public conversation around ${b.productName}'s category is driven less by feature comparison than by switching cost, proof of real output, and scepticism toward unqualified claims.`,
    findings,
    observedTensions: rng.sample(TENSIONS, 3),
    vocabulary: rng.sample(
      ["ship", "actually works", "switching cost", "proof", "slop", "workflow", "receipts", "table stakes"],
      5,
    ),
  };
}

/**
 * Returns cohort designs only. The population is sampled from these by
 * `buildPopulation`, matching what the live provider is asked for.
 */
function genAudience(rng: Rng, _ctx: Ctx) {
  const blueprints = rng.sample(COHORT_BLUEPRINTS, 4);
  const rawShares = blueprints.map(() => 0.15 + rng.next() * 0.35);
  const total = rawShares.reduce((s, v) => s + v, 0);

  const cohorts = blueprints.map((bp, i) => ({
    id: `c_${i}`,
    name: bp.name,
    description: bp.description,
    populationShare: Number((rawShares[i] / total).toFixed(3)),
    coreInterests: bp.interests,
    coreValues: bp.values,
    commonObjections: bp.objections,
    purchasingTriggers: bp.triggers,
    mediaDiet: [...bp.media],
    baseline: bp.baseline,
    color: bp.color,
  }));

  return { cohorts };
}

function genStrategies(rng: Rng, ctx: Ctx) {
  const b = brief(ctx);
  const cohorts = ((ctx.audience as any)?.cohorts ?? []) as any[];
  const cohortIds = cohorts.map((c) => c.id);
  const themes = b.themes.length >= 3 ? b.themes.slice(0, 3) : [...b.themes, "direct_response", "educational"].slice(0, 3);

  return themes.map((theme, i) => {
    const angle = THEME_ANGLES[theme] ?? THEME_ANGLES.direct_response;
    const targets = cohortIds.length
      ? rng.sample(cohortIds, Math.max(1, Math.min(2, cohortIds.length)))
      : ["c_0"];
    return {
      id: `s_${i}`,
      name: angle.name,
      theme,
      positioningThesis: angle.thesis,
      targetCohortIds: targets,
      centralMessage: `${b.productName} removes the part of ${b.targetMarket}'s day that nobody chose to do.`,
      creativeDirection: angle.direction,
      sampleLaunchPost: {
        platform: (b.platforms[0] ?? "x") as any,
        body:
          theme === "memes"
            ? `nobody:\n\nabsolutely nobody:\n\nyour team, 40 minutes into a task that should take 4:\n\n${b.productName} — out today.`
            : theme === "founder_led"
              ? `We built ${b.productName} because we kept losing whole afternoons to the same problem.\n\nIt is live today. Here is exactly what it does, and what it does not do yet.`
              : `${b.productName} is live.\n\n${b.productDescription}\n\nNo setup call. Free while you evaluate.`,
        hashtags: rng.sample(["#buildinpublic", "#launch", "#devtools", "#shipit", "#productivity"], 2),
      },
      representativeImage: {
        prompt: `${angle.direction} Marketing key visual for ${b.productName}, ${b.productDescription}. No text overlay.`,
      },
      callToAction: rng.pick([
        "Start free — no card",
        "See the 90-second demo",
        "Read how it works",
        "Claim an invite",
      ]),
      contentMix: [
        { format: "short_text", platform: "x", weight: 0.4 },
        { format: "image", platform: "instagram", weight: 0.3 },
        { format: "long_thread", platform: "x", weight: 0.2 },
        { format: "poll", platform: "x", weight: 0.1 },
      ],
      accent: angle.accent,
    };
  });
}

function genReaction(rng: Rng, ctx: Ctx): string {
  const persona = (ctx.persona ?? {}) as any;
  const skeptical = (persona.skepticism ?? 0.5) > 0.6;
  const funny = (persona.humor ?? 0.5) > 0.65;
  if (skeptical) {
    return rng.pick([
      "what's the actual pricing though. the page just says 'contact us'",
      "every launch says this. show me the before/after on a real repo",
      "how is this different from what we already pay for",
      "the claim is doing a lot of work here",
    ]);
  }
  if (funny) {
    return rng.pick([
      "ok the hook got me, I'm in",
      "finally someone said it out loud",
      "adding this to the pile of tabs I will absolutely open later",
      "genuinely funny and it still explained the product, rare",
    ]);
  }
  return rng.pick([
    "this is a clean explanation, sending to my team",
    "tried it, setup took under two minutes",
    "the demo does more convincing than the copy does",
    "useful. bookmarking for the next sprint",
  ]);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Expands a strategy into a dated plan. Items are laid out relative to launch
 * day (teasers before, a launch cluster, follow-ups after) and the findings'
 * directives are woven into the item purposes so the timeline visibly reflects
 * what the simulation learned.
 */
function genTimeline(rng: Rng, ctx: Ctx) {
  const b = brief(ctx);
  const strategy = (ctx.strategy ?? {}) as any;
  const findings = ((ctx.findings as any)?.findings ?? []) as any[];
  const cohorts = ((ctx.campaign as any)?.audience?.cohorts ?? []) as any[];

  const launch = new Date(b.launchDate + "T09:00:00Z");
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(launch);
    d.setUTCDate(d.getUTCDate() + dayOffset);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const platform = (b.platforms[0] ?? "x") as string;
  const second = (b.platforms[1] ?? "instagram") as string;
  const cta = strategy.callToAction ?? "Start free";
  const tags = strategy.sampleLaunchPost?.hashtags ?? ["#launch"];

  // Findings become purposes, so each item points back at a simulation lesson.
  const directiveFor = (kind: string) =>
    findings.find((f) => f.kind === kind)?.directive ??
    `Advance the ${strategy.name ?? "campaign"} thesis.`;

  const cohortIds = (n: number) =>
    cohorts.length ? rng.sample(cohorts.map((c: any) => c.id), Math.min(n, cohorts.length)) : [];

  const plan: Array<Record<string, unknown>> = [
    {
      kind: "x_post",
      title: "Teaser — name the problem",
      body: `The part of the week nobody chose to do.\n\nSomething for that, ${
        b.launchDate
      }.`,
      scheduledAt: at(-3, 15),
      platform,
      targetCohortIds: cohortIds(2),
      purpose: directiveFor("opportunity"),
      callToAction: "Watch this space",
      hashtags: tags.slice(0, 1),
      imagePrompt: `${strategy.creativeDirection ?? "Clean, minimal"} Teaser visual for ${b.productName}. No text.`,
    },
    {
      kind: "poll",
      title: "Pre-launch poll — surface the objection",
      body: `How much of your week goes to coordination that could be async?\n\n· Under 2h\n· 2-5h\n· 5-10h\n· I stopped counting`,
      scheduledAt: at(-2, 17),
      platform,
      targetCohortIds: cohortIds(2),
      purpose: "Surface the objection the simulation flagged before launch day, not after.",
      callToAction: "Vote",
      hashtags: [],
    },
    {
      kind: "x_thread",
      title: "Launch thread",
      body:
        strategy.sampleLaunchPost?.body ??
        `${b.productName} is live.\n\n${b.productDescription}`,
      scheduledAt: at(0, 9),
      platform,
      targetCohortIds: cohortIds(3),
      purpose: directiveFor("worked"),
      callToAction: cta,
      hashtags: tags,
      imagePrompt: `${strategy.creativeDirection ?? "Clean"} Launch key visual for ${b.productName}, ${b.productDescription}. No text overlay.`,
    },
    {
      kind: "instagram_carousel",
      title: "Carousel — explain the mechanism",
      body: `Slide 1: The problem\nSlide 2: What changes\nSlide 3: How it works\nSlide 4: What it costs\nSlide 5: ${cta}`,
      scheduledAt: at(0, 13),
      platform: second,
      targetCohortIds: cohortIds(2),
      purpose: directiveFor("opportunity"),
      callToAction: cta,
      hashtags: tags,
      imagePrompt: `Editorial diagram illustrating ${b.productDescription}. Muted palette, generous whitespace.`,
    },
    {
      kind: "image_ad",
      title: "Launch-day ad",
      body: `${strategy.centralMessage ?? b.productName}\n\n${cta}`,
      scheduledAt: at(0, 16),
      platform: second,
      targetCohortIds: cohortIds(1),
      purpose: "Paid reinforcement against the cohort with the highest measured intent.",
      callToAction: cta,
      hashtags: [],
      imagePrompt: `Bold product advertisement for ${b.productName}. High contrast, single focal point.`,
    },
    {
      kind: "response_template",
      title: "Response template — pricing objection",
      body: `Fair question. Pricing is $X/seat/month, no minimum and no setup call. Here's the maths on a team of ten: …`,
      scheduledAt: at(0, 18),
      platform,
      targetCohortIds: cohortIds(1),
      purpose: directiveFor("risk"),
      callToAction: "",
      hashtags: [],
    },
    {
      kind: "survey",
      title: "Day-2 survey — capture objections",
      body: "Short survey sent to anyone who engaged but did not sign up.",
      scheduledAt: at(2, 11),
      platform: "web",
      targetCohortIds: cohortIds(2),
      purpose: "Convert the simulation's predicted objections into real data.",
      callToAction: "Take the 60-second survey",
      hashtags: [],
      form: {
        title: `Help us improve ${b.productName}`,
        description: "Four questions, about a minute. It genuinely shapes what we build next.",
        questions: [
          { id: "q1", prompt: "What nearly stopped you from signing up?", type: "long_text", required: true },
          {
            id: "q2",
            prompt: "Which best describes your team?",
            type: "multiple_choice",
            options: ["Under 10", "10-50", "50-200", "200+"],
            required: true,
          },
          { id: "q3", prompt: "How clear was our pricing?", type: "rating", required: false },
          { id: "q4", prompt: "Email, if you'd like a reply", type: "email", required: false },
        ],
        completionMessage: "Thank you — this goes straight to the team.",
      },
    },
    {
      kind: "follow_up",
      title: "Day-4 follow-up — proof post",
      body: `Four days in. Here are the numbers, including the ones that aren't flattering.`,
      scheduledAt: at(4, 10),
      platform,
      targetCohortIds: cohortIds(2),
      purpose: directiveFor("failed"),
      callToAction: "Read the write-up",
      hashtags: tags.slice(0, 1),
      imagePrompt: `Data visualisation showing early adoption metrics for ${b.productName}. Editorial, restrained.`,
    },
    {
      kind: "community_prompt",
      title: "Day-6 community prompt",
      body: `What did you automate away this week? We'll feature the best answers.`,
      scheduledAt: at(6, 15),
      platform,
      targetCohortIds: cohortIds(2),
      purpose: "Convert early adopters into visible advocates.",
      callToAction: "Reply with yours",
      hashtags: tags,
    },
  ];

  return { items: plan };
}

function genFindingsEdit(rng: Rng, ctx: Ctx) {
  const action = (ctx.action ?? "rewrite_shorter") as string;
  const body = (ctx.body ?? "") as string;
  const first = body.split("\n")[0] ?? body;

  switch (action) {
    case "rewrite_shorter":
      return { body: first.slice(0, 110).trim(), note: "Cut to a single line." };
    case "make_more_direct":
      return {
        body: first.replace(/^(we|our|it)\b/i, "You").replace(/\s+/g, " ").trim(),
        note: "Reframed around the reader.",
      };
    case "make_funnier":
      return {
        body: `${first}\n\n(yes, we also tried doing this with a spreadsheet. it did not go well.)`,
        note: "Added a self-deprecating beat.",
      };
    case "replace_hook":
      return {
        body: [rng.pick([
          "Nobody schedules a meeting because they want to.",
          "You already know how this week goes.",
          "The status update nobody reads, automated.",
        ]), ...body.split("\n").slice(1)].join("\n"),
        note: "New opening hook.",
      };
    case "replace_cta":
      return {
        callToAction: rng.pick(["Start free — no card", "See the 90-second demo", "Take it for a week"]),
        note: "New call to action.",
      };
    case "generate_alternatives":
      return {
        alternatives: [
          first.slice(0, 120),
          `${first.split(".")[0]}. Here's the part that matters.`,
          `Short version: ${first.toLowerCase()}`,
        ],
        note: "Three alternatives.",
      };
    case "adapt_for_platform":
      return {
        body: `${first}\n\n${rng.pick(["#launch", "#buildinpublic"])}`,
        note: "Adapted for the target platform.",
      };
    default:
      return { note: "No change." };
  }
}

/**
 * A plausible build plan with a genuine dependency structure — a spine that
 * serialises, plus branches that parallelise, plus one high-risk integration.
 * Shaped so the graph analysis has something real to find.
 */
function genBuildPlan(rng: Rng, ctx: Ctx) {
  const company = (ctx.company ?? {}) as any;
  const name = company.name ?? "the product";

  const blueprint: Array<[string, string, string, number, number[], number, string]> = [
    ["Project scaffold and CI", "Repo, typechecking, test runner, and a deploy pipeline that runs on every push.", "infra", 2, [], 0.15, "Well-trodden, but CI runners are occasionally flaky."],
    ["Data model and migrations", `Core schema for ${name}, migration tooling, and seed data.`, "data", 3, [0], 0.3, "Schema churn is likely once the first real screens exist."],
    ["Auth and sessions", "Signup, login, session handling, and route protection.", "auth", 4, [0, 1], 0.55, "Third-party provider behaviour under edge cases is unverified."],
    ["Core API surface", "CRUD endpoints and validation for the primary entities.", "backend", 4, [1], 0.25, "Straightforward once the schema settles."],
    ["Primary UI shell", "Navigation, layout, and the main screen skeleton.", "frontend", 3, [0], 0.2, "Design is not final; rework is possible."],
    ["Main workflow screens", "The end-to-end flow a user actually completes.", "frontend", 5, [3, 4], 0.35, "Depends on API shape holding steady."],
    ["Third-party integration", "External service wiring, retries, and failure handling.", "integration", 4, [3], 0.7, "Undocumented rate limits and no sandbox environment."],
    ["Background jobs", "Queue, scheduling, and retry semantics for async work.", "backend", 3, [1, 3], 0.4, "Delivery guarantees under load are untested."],
    ["Test coverage on critical paths", "Integration tests across auth and the main workflow.", "testing", 3, [2, 5], 0.2, "Time pressure tends to compress this."],
    ["Observability and alerting", "Structured logs, error tracking, and a minimal dashboard.", "ops", 2, [0, 7], 0.25, "Easy to defer and then regret."],
    ["Production hardening", "Rate limits, input validation sweep, and a security pass.", "ops", 3, [2, 6, 8], 0.45, "Unknown unknowns surface here."],
  ];

  const tasks = blueprint.map(([title, description, area, days, deps, risk, riskReason], i) => ({
    id: `t_${i}`,
    title,
    description,
    area,
    estimateDays: days,
    dependsOn: deps.map((d) => `t_${d}`),
    risk: Number(rng.around(risk, 0.08).toFixed(2)),
    riskReason,
  }));

  return {
    summary: `An ${tasks.length}-task plan to get ${name} to a working end-to-end product, sequenced around auth and the third-party integration.`,
    tasks,
    openQuestions: rng.sample(
      [
        "Which auth provider, and does it support the tenancy model we need?",
        "Does the third-party API have a sandbox, or do we test against production?",
        "What is the expected write volume in the first month?",
        "Do we need multi-region on day one or can it wait?",
      ],
      3,
    ),
    stack: ["TypeScript", "Next.js", "Postgres", "a hosted queue"],
  };
}

const GENERATORS: Record<string, (rng: Rng, ctx: Ctx) => unknown> = {
  buildplan: genBuildPlan,
  research: genResearch,
  audience: genAudience,
  strategies: (rng, ctx) => ({ strategies: genStrategies(rng, ctx) }),
  timeline: genTimeline,
  edit: genFindingsEdit,
};

export function createMockProvider(): LlmProvider {
  return {
    name: "mock",
    live: false,

    async structured<T extends z.ZodTypeAny>(
      schema: T,
      system: string,
      user: string,
      opts: GenerateOptions = {},
    ): Promise<z.infer<T>> {
      const seed = opts.seed ?? hashSeed(`${opts.task ?? ""}|${user}`);
      const rng = makeRng(seed);
      const ctx = opts.context ?? {};

      const gen = opts.task ? GENERATORS[opts.task] : undefined;
      if (gen) {
        const value = gen(rng, ctx);
        // Strategies are produced as a bare array by some callers and as a
        // wrapped object by others; accept whichever the schema wants.
        const parsed = schema.safeParse(value);
        if (parsed.success) return parsed.data as z.infer<T>;
        const unwrapped = (value as any)?.strategies;
        if (unwrapped) {
          const alt = schema.safeParse(unwrapped);
          if (alt.success) return alt.data as z.infer<T>;
        }
        throw new Error(
          `mock generator for task "${opts.task}" did not match schema: ${parsed.error.message.slice(0, 300)}`,
        );
      }

      throw new Error(
        `mock provider has no generator for task "${opts.task ?? "(none)"}" — add one in src/lib/ai/mock.ts`,
      );
    },

    async text(system, user, opts: GenerateOptions = {}) {
      const rng = makeRng(opts.seed ?? hashSeed(user));
      if (opts.task === "reaction") return genReaction(rng, opts.context ?? {});
      return "";
    },

    async image(prompt, { seed, n = 2 } = {}) {
      const rng = makeRng(seed ?? hashSeed(prompt));
      // Deterministic gradient placeholders. Inline SVG data URIs so images
      // render with no network and no files on disk.
      return Array.from({ length: n }, (_, i): ImageResult => {
        const h1 = rng.int(0, 360);
        const h2 = (h1 + rng.int(40, 140)) % 360;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${h1},72%,58%)"/><stop offset="100%" stop-color="hsl(${h2},68%,44%)"/>
</linearGradient></defs>
<rect width="640" height="640" fill="url(#g)"/>
<circle cx="${rng.int(120, 520)}" cy="${rng.int(120, 520)}" r="${rng.int(80, 190)}" fill="rgba(255,255,255,0.14)"/>
<circle cx="${rng.int(120, 520)}" cy="${rng.int(120, 520)}" r="${rng.int(50, 130)}" fill="rgba(0,0,0,0.10)"/>
</svg>`;
        return {
          url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
          prompt: `${prompt} (variation ${i + 1})`,
          provider: "mock",
        };
      });
    },
  };
}
