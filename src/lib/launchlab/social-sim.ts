/**
 * The synthetic social simulation.
 *
 * Design: a seeded, tick-based engine where routine engagement is resolved by
 * cheap deterministic logic and only *pivotal* moments escalate to Grok. That
 * split is what makes the run fast enough to watch, cheap enough to run three
 * times in parallel, and reproducible enough to rehearse.
 *
 * Per tick:
 *   1. Rank a feed for each persona (affinity + influence + recency + novelty)
 *   2. Each persona resolves an action against the top item it hasn't seen
 *   3. Reactions propagate along follow edges, weighted by influence
 *   4. Repeated language crystallises into a named narrative
 *   5. Narratives gain or lose momentum; dying ones are pruned
 *
 * Everything is emitted as a stream of events so the UI can animate the run
 * rather than showing a spinner and then a number.
 */
import { hashSeed, makeRng, type Rng } from "./rng";
import type {
  AudienceCohort,
  CampaignStrategy,
  Narrative,
  SimEvent,
  SimEventType,
  StrategyScores,
  SyntheticAudience,
  SyntheticPersona,
} from "./types";

export interface SimPost {
  id: string;
  authorId: string | null; // null = the brand
  body: string;
  tick: number;
  sentiment: number;
  /** Accumulated engagement, used for feed ranking. */
  heat: number;
  narrativeId?: string;
  isBrand: boolean;
}

export interface SimSnapshot {
  tick: number;
  totalTicks: number;
  events: SimEvent[];
  posts: SimPost[];
  narratives: Narrative[];
  /** Running per-cohort sentiment and reach, for live charts. */
  cohortState: Array<{
    cohortId: string;
    reached: number;
    population: number;
    sentiment: number;
    purchaseIntent: number;
  }>;
  scores: StrategyScores;
  /** Personas that have been reached, for the graph animation. */
  activatedPersonaIds: string[];
}

/** Escalate to the LLM for a reaction. Injected so the engine stays pure. */
export type ReactionFn = (input: {
  persona: SyntheticPersona;
  cohort: AudienceCohort;
  post: SimPost;
  strategy: CampaignStrategy;
  stance: "supportive" | "skeptical" | "hostile" | "curious";
}) => Promise<string>;

interface PersonaState {
  persona: SyntheticPersona;
  cohort: AudienceCohort;
  reached: boolean;
  /** -1..1 how this persona currently feels about the campaign. */
  sentiment: number;
  /** 0..1 how well they understand the message. */
  comprehension: number;
  /** 0..1 likelihood to buy. */
  intent: number;
  seen: Set<string>;
  /** Personas who see this one's posts. */
  followers: string[];
  /** Personas whose posts appear in this one's feed. */
  following: Set<string>;
}

const NARRATIVE_SEEDS: Record<string, { label: string; sentiment: number; trigger: RegExp }> = {
  price: { label: "Pricing is unclear", sentiment: -0.6, trigger: /pric|cost|\$|pay|subscription/i },
  proof: { label: "Show real output", sentiment: -0.3, trigger: /proof|demo|show me|receipts|actually/i },
  craft: { label: "This feels well made", sentiment: 0.6, trigger: /clean|craft|polish|taste|beautiful/i },
  derivative: { label: "Seen this before", sentiment: -0.5, trigger: /another|derivative|same as|already/i },
  timesaved: { label: "Genuinely saves time", sentiment: 0.7, trigger: /minutes|fast|time|quick|hours/i },
  humor: { label: "The joke landed", sentiment: 0.5, trigger: /lol|funny|joke|got me|dead/i },
};

export class Simulation {
  private rng: Rng;
  private states = new Map<string, PersonaState>();
  private posts: SimPost[] = [];
  private events: SimEvent[] = [];
  private narratives = new Map<string, Narrative>();
  private tick = 0;
  private eventSeq = 0;
  private llmBudget: number;

  constructor(
    private audience: SyntheticAudience,
    private strategy: CampaignStrategy,
    private opts: {
      seed: number;
      ticks: number;
      /** Max Grok calls for the whole run; the rest resolve deterministically. */
      llmBudget?: number;
      reaction?: ReactionFn;
    },
  ) {
    this.rng = makeRng(opts.seed);
    this.llmBudget = opts.llmBudget ?? 12;

    const cohortById = new Map(audience.cohorts.map((c) => [c.id, c]));
    const followersOf = new Map<string, string[]>();
    const followingOf = new Map<string, Set<string>>();
    audience.edges.forEach((e) => {
      // edge from A to B means A follows B, so A sees B's posts
      const list = followersOf.get(e.to) ?? [];
      list.push(e.from);
      followersOf.set(e.to, list);

      const set = followingOf.get(e.from) ?? new Set<string>();
      set.add(e.to);
      followingOf.set(e.from, set);
    });

    audience.personas.forEach((p) => {
      const cohort = cohortById.get(p.cohortId);
      if (!cohort) return;
      this.states.set(p.id, {
        persona: p,
        cohort,
        reached: false,
        sentiment: 0,
        comprehension: 0,
        intent: 0,
        seen: new Set(),
        followers: followersOf.get(p.id) ?? [],
        following: followingOf.get(p.id) ?? new Set(),
      });
    });

    // Seed the run with the brand's launch post.
    this.posts.push({
      id: "post_launch",
      authorId: null,
      body: strategy.sampleLaunchPost.body,
      tick: 0,
      sentiment: 0.2,
      heat: 1,
      isBrand: true,
    });
  }

  // -------------------------------------------------------------------------
  // Scoring helpers
  // -------------------------------------------------------------------------

  /**
   * How well a strategy's creative theme matches a persona's disposition.
   * This is the main lever that makes different strategies genuinely diverge
   * rather than all trending the same direction.
   */
  private affinity(st: PersonaState): number {
    const p = st.persona;
    const theme = this.strategy.theme;
    const targeted = this.strategy.targetCohortIds.includes(st.cohort.id) ? 0.18 : 0;

    let base = 0.4 + targeted;
    switch (theme) {
      case "memes":
        base += p.humor * 0.5 - p.skepticism * 0.25;
        break;
      case "founder_led":
        base += (1 - p.skepticism) * 0.28 + p.persuadability * 0.2;
        break;
      case "direct_response":
        base += (1 - p.humor) * 0.2 + (p.purchasingTriggers.length > 1 ? 0.12 : 0);
        break;
      case "educational":
        base += p.skepticism * 0.32 - p.humor * 0.12;
        break;
      case "aspirational":
        base += p.influence * 0.3 - p.skepticism * 0.2;
        break;
      case "serious":
        base += p.skepticism * 0.24 - p.humor * 0.22;
        break;
    }
    return Math.max(0, Math.min(1, base));
  }

  /**
   * Feed ranking.
   *
   * A persona only sees posts from accounts they follow, plus brand posts that
   * the algorithm injects. Organic reach therefore has to travel the follow
   * graph — which is what stops every strategy from trivially reaching 100% of
   * the audience and makes the network visualisation mean something.
   */
  private rankFeed(st: PersonaState): SimPost[] {
    const platformMatch = st.cohort.mediaDiet.includes(this.strategy.sampleLaunchPost.platform);
    // Algorithmic injection: brand content surfaces to non-followers at a rate
    // that decays as the launch ages, so reach plateaus at a level that
    // depends on platform fit rather than saturating at 100% for everyone.
    const decay = 1 / (1 + this.tick * 0.09);
    const injectionRate = (platformMatch ? 0.34 : 0.11) * decay;

    return this.posts
      .filter((post) => {
        if (st.seen.has(post.id) || post.authorId === st.persona.id) return false;
        if (post.isBrand) return this.rng.bool(injectionRate);
        return post.authorId ? st.following.has(post.authorId) : false;
      })
      .map((post) => {
        const author = post.authorId ? this.states.get(post.authorId) : null;
        const influence = author ? author.persona.influence : 0.85;
        const recency = 1 / (1 + (this.tick - post.tick) * 0.6);
        const novelty = this.rng.next() * 0.15;
        return { post, score: post.heat * 0.4 + influence * 0.3 + recency * 0.25 + novelty };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.post);
  }

  private emit(
    type: SimEventType,
    st: PersonaState,
    extra: Partial<SimEvent> = {},
  ): SimEvent {
    const ev: SimEvent = {
      id: `e_${this.eventSeq++}`,
      tick: this.tick,
      type,
      personaId: st.persona.id,
      cohortId: st.cohort.id,
      sentiment: extra.sentiment ?? st.sentiment,
      llmBacked: false,
      ...extra,
    };
    this.events.push(ev);
    return ev;
  }

  /** Detect or reinforce a narrative from post language. */
  private classifyNarrative(body: string, sentiment: number): string | undefined {
    for (const [key, seed] of Object.entries(NARRATIVE_SEEDS)) {
      if (!seed.trigger.test(body)) continue;
      const existing = this.narratives.get(key);
      if (existing) {
        existing.momentum += 1;
        existing.sentiment = existing.sentiment * 0.8 + sentiment * 0.2;
      } else {
        this.narratives.set(key, {
          id: key,
          label: seed.label,
          summary: `Emerged from audience replies at tick ${this.tick}.`,
          sentiment: seed.sentiment,
          carrierIds: [],
          firstSeenTick: this.tick,
          momentum: 1,
        });
      }
      return key;
    }
    return undefined;
  }

  /**
   * A persona resolves one action. Routine outcomes are deterministic; only a
   * high-influence persona forming a strong opinion is worth an LLM call.
   */
  private async act(st: PersonaState, post: SimPost): Promise<void> {
    st.seen.add(post.id);

    const aff = this.affinity(st);
    const wasReached = st.reached;
    st.reached = true;
    if (!wasReached) this.emit("impression", st, { targetPostId: post.id });

    // Comprehension approaches a ceiling rather than marching to 1.0. The
    // ceiling depends on how explanatory the creative is and how well it fits
    // this persona — a meme lands emotionally but explains less.
    const clarity =
      this.strategy.theme === "educational" || this.strategy.theme === "direct_response"
        ? 0.9
        : this.strategy.theme === "memes"
          ? 0.55
          : 0.72;
    const comprehensionCeiling = clarity * (0.65 + aff * 0.35);
    st.comprehension += (comprehensionCeiling - st.comprehension) * 0.45;

    // Sentiment converges asymptotically toward the affinity-implied target
    // instead of accumulating past it. Skeptics move more slowly and settle
    // lower, which is what keeps cohorts genuinely distinguishable.
    const target = Math.max(-1, Math.min(1, (aff - 0.5) * 2.3));
    const rate = 0.38 * (1 - st.persona.skepticism * 0.35);
    st.sentiment += (target - st.sentiment) * rate;
    st.sentiment = Math.max(-1, Math.min(1, st.sentiment));

    // Intent needs both feeling and understanding: enthusiasm without
    // comprehension does not convert, and vice versa.
    const intentTarget =
      st.sentiment > 0
        ? st.sentiment * (0.35 + st.comprehension * 0.65) * (0.55 + st.persona.persuadability * 0.45)
        : 0;
    st.intent += (intentTarget - st.intent) * 0.4;
    st.intent = Math.max(0, Math.min(1, st.intent));

    const e = st.persona.engagement;
    const positive = st.sentiment > 0.15;
    const negative = st.sentiment < -0.15;

    // Cheap engagement first.
    if (this.rng.bool(e.lurkRate * 0.5)) return; // lurked, no visible action

    if (positive && this.rng.bool(e.repostRate * (0.4 + aff * 0.8))) {
      post.heat += 0.6 + st.persona.influence;
      this.emit("repost", st, { targetPostId: post.id, sentiment: st.sentiment });
      return;
    }

    if (this.rng.bool(e.replyRate * (0.5 + Math.abs(st.sentiment)))) {
      const stance = negative
        ? st.persona.skepticism > 0.7
          ? "hostile"
          : "skeptical"
        : positive
          ? "supportive"
          : "curious";

      // Escalate to Grok only when this reply actually matters: a high-influence
      // persona with a strong opinion. Everything else uses canned reactions.
      const pivotal =
        st.persona.influence > 0.62 && Math.abs(st.sentiment) > 0.35 && this.llmBudget > 0;

      let body: string;
      let llmBacked = false;
      if (pivotal && this.opts.reaction) {
        this.llmBudget--;
        try {
          body = await this.opts.reaction({
            persona: st.persona,
            cohort: st.cohort,
            post,
            strategy: this.strategy,
            stance,
          });
          llmBacked = true;
        } catch {
          body = this.cannedReply(st, stance);
        }
      } else {
        body = this.cannedReply(st, stance);
      }

      const narrativeId = this.classifyNarrative(body, st.sentiment);
      if (narrativeId) {
        const n = this.narratives.get(narrativeId)!;
        if (!n.carrierIds.includes(st.persona.id)) n.carrierIds.push(st.persona.id);
      }

      const reply: SimPost = {
        id: `post_${this.posts.length}`,
        authorId: st.persona.id,
        body,
        tick: this.tick,
        sentiment: st.sentiment,
        heat: 0.4 + st.persona.influence * 0.8,
        narrativeId,
        isBrand: false,
      };
      this.posts.push(reply);
      post.heat += 0.3;

      this.emit("reply", st, {
        targetPostId: post.id,
        body,
        sentiment: st.sentiment,
        llmBacked,
        narrativeId,
      });

      if (stance === "hostile") this.emit("detractor_surfaced", st, { body, narrativeId });
      if (st.persona.humor > 0.75 && positive && this.rng.bool(0.3)) {
        this.emit("meme", st, { body: `[meme riff] ${body.slice(0, 60)}`, sentiment: st.sentiment });
      }
      if (st.persona.skepticism > 0.7 && this.rng.bool(0.35)) {
        this.emit("investigation", st, { body: "checking the pricing page and the docs", sentiment: -0.1 });
      }
      return;
    }

    if (positive && this.rng.bool(0.5)) {
      post.heat += 0.15;
      this.emit("like", st, { targetPostId: post.id, sentiment: st.sentiment });
    }
  }

  private cannedReply(st: PersonaState, stance: string): string {
    const banks: Record<string, string[]> = {
      hostile: [
        "another one of these. what's the actual price",
        "big claim, zero proof. show a real before and after",
        "this is the same pitch as every tool in the category",
      ],
      skeptical: [
        "how is this different from what we already pay for",
        "the pricing page just says contact us, that's a no from me",
        "interested but I want to see it on a real workload first",
      ],
      curious: [
        "wait does this actually work for async teams",
        "what's the setup like, minutes or hours",
        "bookmarking to look at properly later",
      ],
      supportive: [
        "tried it, setup took under two minutes. genuinely fast",
        "this is the clean explanation I've been wanting",
        "ok the demo does more convincing than the copy does",
        "lol the hook got me and it still explained the product",
      ],
    };
    return this.rng.pick(banks[stance] ?? banks.curious);
  }

  // -------------------------------------------------------------------------
  // Scores
  // -------------------------------------------------------------------------

  private computeScores(): StrategyScores {
    const all = [...this.states.values()];
    const reached = all.filter((s) => s.reached);
    const n = all.length || 1;

    const avg = (f: (s: PersonaState) => number, set = reached) =>
      set.length ? set.reduce((sum, s) => sum + f(s), 0) / set.length : 0;

    const reach = (reached.length / n) * 100;
    const meanSentiment = avg((s) => s.sentiment);
    const comprehension = avg((s) => s.comprehension) * 100;
    const intent = avg((s) => s.intent) * 100;

    const reposts = this.events.filter((e) => e.type === "repost").length;
    const replies = this.events.filter((e) => e.type === "reply").length;
    const detractors = this.events.filter((e) => e.type === "detractor_surfaced").length;

    // Controversy is polarisation, not negativity: a run where everyone mildly
    // agrees scores low, a run that splits the audience scores high.
    const variance = reached.length
      ? reached.reduce((s, x) => s + (x.sentiment - meanSentiment) ** 2, 0) / reached.length
      : 0;

    const targetedReach = (() => {
      const targeted = all.filter((s) => this.strategy.targetCohortIds.includes(s.cohort.id));
      if (!targeted.length) return reach;
      return (targeted.filter((s) => s.reached).length / targeted.length) * 100;
    })();

    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

    return {
      reach: clamp(reach),
      trust: clamp(50 + meanSentiment * 45 - detractors * 1.5),
      messageComprehension: clamp(comprehension),
      purchaseIntent: clamp(intent),
      sharePropensity: clamp((reposts / Math.max(1, reached.length)) * 55),
      controversy: clamp(Math.sqrt(variance) * 120 + detractors * 2.5),
      audienceFit: clamp(targetedReach * 0.6 + (meanSentiment + 1) * 20),
      brandSafetyRisk: clamp(detractors * 4 + Math.sqrt(variance) * 60 + (replies ? 0 : 5)),
    };
  }

  private cohortState() {
    const byCohort = new Map<string, PersonaState[]>();
    this.states.forEach((s) => {
      const list = byCohort.get(s.cohort.id) ?? [];
      list.push(s);
      byCohort.set(s.cohort.id, list);
    });
    return [...byCohort.entries()].map(([cohortId, members]) => {
      const reached = members.filter((m) => m.reached);
      return {
        cohortId,
        reached: reached.length,
        population: members.length,
        sentiment: reached.length
          ? Number((reached.reduce((s, m) => s + m.sentiment, 0) / reached.length).toFixed(3))
          : 0,
        purchaseIntent: reached.length
          ? Math.round((reached.reduce((s, m) => s + m.intent, 0) / reached.length) * 100)
          : 0,
      };
    });
  }

  snapshot(sinceEventIndex = 0): SimSnapshot {
    return {
      tick: this.tick,
      totalTicks: this.opts.ticks,
      events: this.events.slice(sinceEventIndex),
      posts: this.posts,
      narratives: [...this.narratives.values()].sort((a, b) => b.momentum - a.momentum),
      cohortState: this.cohortState(),
      scores: this.computeScores(),
      activatedPersonaIds: [...this.states.values()].filter((s) => s.reached).map((s) => s.persona.id),
    };
  }

  /**
   * Runs the whole simulation, yielding a snapshot after each tick so the
   * caller can stream progress to the browser.
   */
  /**
   * The brand keeps posting on a cadence drawn from the strategy's content
   * mix. Without this, a strategy that fails to spark replies in the first few
   * ticks starves — there is nothing in anyone's feed — and the run dies from
   * cold start rather than from the strategy actually being weak.
   */
  private brandPost(): void {
    const mix = this.strategy.contentMix[this.posts.filter((p) => p.isBrand).length % this.strategy.contentMix.length];
    const lines = [
      this.strategy.centralMessage,
      `${this.strategy.callToAction} — ${this.strategy.sampleLaunchPost.hashtags.join(" ")}`,
      this.strategy.positioningThesis.split(".")[0] + ".",
      this.strategy.creativeDirection.split(".")[0] + ".",
    ];
    this.posts.push({
      id: `post_brand_${this.tick}`,
      authorId: null,
      body: this.rng.pick(lines),
      tick: this.tick,
      sentiment: 0.15,
      heat: 0.9,
      isBrand: true,
    });
    void mix;
  }

  async *run(): AsyncGenerator<SimSnapshot> {
    for (let t = 1; t <= this.opts.ticks; t++) {
      this.tick = t;
      const eventMark = this.events.length;

      if (t % 4 === 0) this.brandPost();

      // Personas act in randomised order so no one systematically goes first.
      const order = this.rng.shuffle([...this.states.values()]);
      for (const st of order) {
        // Not everyone is online every tick.
        if (!this.rng.bool(0.5 + st.persona.engagement.postRate * 0.35)) continue;
        const feed = this.rankFeed(st);
        if (!feed.length) continue;
        await this.act(st, feed[0]);
      }

      // Narrative decay — anything not reinforced this tick loses momentum.
      this.narratives.forEach((n, key) => {
        const reinforced = this.events
          .slice(eventMark)
          .some((e) => e.narrativeId === key);
        if (!reinforced) n.momentum *= 0.82;
        if (n.momentum < 0.35) this.narratives.delete(key);
      });

      // Announce narratives that have crossed into significance.
      this.narratives.forEach((n) => {
        if (n.momentum >= 3 && !this.events.some((e) => e.type === "narrative_formed" && e.narrativeId === n.id)) {
          const carrier = n.carrierIds[0];
          const st = carrier ? this.states.get(carrier) : undefined;
          if (st) this.emit("narrative_formed", st, { narrativeId: n.id, body: n.label, sentiment: n.sentiment });
        }
      });

      yield this.snapshot(eventMark);
    }
  }

  finalEvents(): SimEvent[] {
    return this.events;
  }
}

export function seedFor(campaignId: string, strategyId: string): number {
  return hashSeed(`${campaignId}:${strategyId}`);
}
