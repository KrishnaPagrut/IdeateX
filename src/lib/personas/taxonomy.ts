// ---------------------------------------------------------------------------
// The persona pool taxonomy: domains → subdomains, each a pool of ~20-30
// personas. Planners never see individual personas at library scale — they
// request pools by name in a casting spec ("12 people from
// consumers/budget-households matching price-sensitive"), and the engine
// resolves the spec to concrete personas within the run's persona budget.
//
// Adding a subdomain here is enough for the seeder to grow it and for
// planners to start requesting it.
// ---------------------------------------------------------------------------

export interface Subdomain {
  key: string;
  name: string;
  description: string;
  /** Seed-time guidance: the kinds of people this pool must span. */
  seedHints: string;
}

export interface Domain {
  key: string;
  name: string;
  subdomains: Subdomain[];
}

export const TAXONOMY: Domain[] = [
  {
    key: "consumers",
    name: "Consumers",
    subdomains: [
      {
        key: "budget-households",
        name: "Budget households",
        description: "Price-first buyers managing tight monthly budgets; deal-hunters, coupon users, subscription-averse.",
        seedHints: "single parents, fixed-income retirees, students, large families, gig-income households",
      },
      {
        key: "affluent-professionals",
        name: "Affluent professionals",
        description: "High-income urban and suburban professionals; convenience- and status-driven, time-poor.",
        seedHints: "lawyers, doctors, finance, tech leads, dual-income-no-kids couples, luxury-adjacent tastes",
      },
      {
        key: "suburban-families",
        name: "Suburban families",
        description: "Family-first buyers optimizing for kids, safety, and value; heavy comparison shoppers.",
        seedHints: "parents of young kids and teens, PTA types, minivan-and-mortgage households, multigenerational homes",
      },
      {
        key: "students-young-adults",
        name: "Students & young adults",
        description: "16-26; low income but high influence, mobile-native, trend-driven, subscription-fatigued.",
        seedHints: "college students, first-jobbers, community-college part-timers, campus workers, young adults at home",
      },
      {
        key: "seniors-retirees",
        name: "Seniors & retirees",
        description: "65+; fixed incomes, loyalty to known brands, wary of tech friction and subscriptions.",
        seedHints: "recent retirees, elderly living alone, grandparent caregivers, retirement-community residents",
      },
    ],
  },
  {
    key: "tech",
    name: "Technology adopters",
    subdomains: [
      {
        key: "early-adopters",
        name: "Early adopters",
        description: "Try-everything-first crowd; forgiving of rough edges, demanding of novelty and speed.",
        seedHints: "indie hackers, gadget reviewers, crypto/AI enthusiasts, beta testers, homelab tinkerers",
      },
      {
        key: "pragmatic-mainstream",
        name: "Pragmatic mainstream",
        description: "Adopts once value is proven; hates migration pain; needs social proof and support.",
        seedHints: "office workers, small-town IT admins, practical millennials, 'my phone is fine' types",
      },
      {
        key: "tech-skeptics",
        name: "Tech skeptics & laggards",
        description: "Distrustful of apps, subscriptions, data collection; adopts only under necessity.",
        seedHints: "privacy hawks, rural low-bandwidth users, older trades workers, analog loyalists",
      },
    ],
  },
  {
    key: "business",
    name: "Business buyers",
    subdomains: [
      {
        key: "small-business-owners",
        name: "Small business owners",
        description: "Owner-operators wearing every hat; cash-flow sensitive, ROI-now decision style.",
        seedHints: "restaurant owners, salon owners, contractors, e-commerce sellers, franchisees, family shops",
      },
      {
        key: "startup-operators",
        name: "Startup operators",
        description: "Speed-obsessed builders at seed-to-B startups; tool-hoppers, credit-card buyers.",
        seedHints: "founders, first PMs, growth marketers, ops leads, developer-buyers",
      },
      {
        key: "enterprise-buyers",
        name: "Enterprise buyers",
        description: "Committee purchasers; procurement, compliance, integration and vendor-risk driven.",
        seedHints: "IT directors, procurement managers, security reviewers, line-of-business VPs",
      },
    ],
  },
  {
    key: "creators",
    name: "Creators & culture",
    subdomains: [
      {
        key: "content-creators",
        name: "Content creators",
        description: "Audience-builders monetizing attention; platform-dependent, trend-sensitive.",
        seedHints: "YouTubers, streamers, newsletter writers, podcast hosts, influencers at all follower sizes",
      },
      {
        key: "artists-makers",
        name: "Artists & makers",
        description: "Craft-first creatives selling physical or digital work; allergic to enshittification.",
        seedHints: "illustrators, Etsy sellers, musicians, photographers, furniture makers, tattoo artists",
      },
      {
        key: "urban-creatives",
        name: "Urban creatives",
        description: "Design-literate city dwellers; aesthetics and identity drive adoption; early to cultural trends.",
        seedHints: "designers, architects, gallery workers, vintage collectors, cafe regulars",
      },
    ],
  },
  {
    key: "health",
    name: "Health & wellness",
    subdomains: [
      {
        key: "chronic-condition",
        name: "Chronic-condition patients",
        description: "Managing ongoing conditions; routine-bound, cost-of-care aware, evidence-hungry.",
        seedHints: "diabetes, hypertension, chronic pain, autoimmune patients; their caregivers",
      },
      {
        key: "fitness-optimizers",
        name: "Fitness & optimizers",
        description: "Trackers and self-improvers; data-driven, willing to pay for measurable gains.",
        seedHints: "gym rats, runners, biohackers, weekend athletes, supplement stackers",
      },
      {
        key: "care-providers",
        name: "Care providers",
        description: "Clinicians and care workers; evidence- and workflow-driven, liability-aware, time-starved.",
        seedHints: "nurses, primary-care physicians, therapists, pharmacists, home-care aides, clinic managers",
      },
      {
        key: "wellness-seekers",
        name: "Wellness seekers",
        description: "Stress, sleep, and balance focused; skeptical of hype but drawn to ritual and community.",
        seedHints: "yoga practitioners, meditation-app users, burned-out professionals, new parents",
      },
    ],
  },
  {
    key: "public-sector",
    name: "Public & civic",
    subdomains: [
      {
        key: "educators",
        name: "Educators",
        description: "Teachers and administrators; budget-constrained, student-outcome and workload driven.",
        seedHints: "K-12 teachers, professors, school IT, district admins, tutors",
      },
      {
        key: "civic-workers",
        name: "Civic & government workers",
        description: "Process- and mandate-bound; risk-averse, accessibility and equity conscious.",
        seedHints: "city planners, librarians, social workers, DMV clerks, nonprofit staff",
      },
      {
        key: "rural-communities",
        name: "Rural communities",
        description: "Distance- and infrastructure-shaped lives; self-reliant, community-trust driven.",
        seedHints: "farmers, ranchers, small-town shop owners, utility co-op members, volunteer firefighters",
      },
    ],
  },
  {
    key: "workforce",
    name: "Workforce",
    subdomains: [
      {
        key: "gig-workers",
        name: "Gig & shift workers",
        description: "Hour-by-hour earners; cash-flow volatile, platform-wary, time-arbitrage sensitive.",
        seedHints: "rideshare drivers, delivery couriers, warehouse pickers, baristas, travel nurses",
      },
      {
        key: "skilled-trades",
        name: "Skilled trades",
        description: "Hands-on professionals; tool-quality obsessed, word-of-mouth driven, BS-intolerant.",
        seedHints: "electricians, plumbers, mechanics, HVAC techs, welders, foremen",
      },
      {
        key: "corporate-employees",
        name: "Corporate employees",
        description: "Salaried office workers; careers, commutes, and benefits shape their spending.",
        seedHints: "middle managers, HR, accountants, sales reps, remote workers, recent grads",
      },
    ],
  },
  {
    key: "global",
    name: "Global markets",
    subdomains: [
      {
        key: "emerging-markets",
        name: "Emerging markets",
        description: "Consumers in fast-growing economies; mobile-first, price-per-value sharp, infrastructure-aware.",
        seedHints: "India, Brazil, Nigeria, Indonesia, Vietnam, Mexico — city and small-town, across incomes",
      },
      {
        key: "european-consumers",
        name: "European consumers",
        description: "EU/UK buyers; privacy-regulation literate, quality-over-novelty, wary of US-style subscriptions.",
        seedHints: "Germany, France, UK, Nordics, Spain, Poland — mix of urban and provincial, all ages",
      },
      {
        key: "east-asian-consumers",
        name: "East Asian consumers",
        description: "Japan, Korea, Taiwan, urban China; super-app natives, quality- and service-standard demanding.",
        seedHints: "Tokyo salarymen, Seoul students, Taipei families, Shanghai professionals, rural-to-urban migrants",
      },
      {
        key: "middle-east-africa",
        name: "Middle East & Africa",
        description: "Gulf, Levant, and African consumers; young populations, remittance economies, mobile-money fluent.",
        seedHints: "Dubai expats, Cairo families, Nairobi entrepreneurs, Lagos traders, Johannesburg professionals",
      },
    ],
  },
  {
    key: "finance",
    name: "Financial lives",
    subdomains: [
      {
        key: "underbanked",
        name: "Underbanked & cash-first",
        description: "Thin credit files, cash and prepaid rails; fee-burned and institution-wary.",
        seedHints: "check-cashing users, recent immigrants, cash-tip workers, credit-invisible young adults",
      },
      {
        key: "debt-managers",
        name: "Debt managers",
        description: "Juggling student loans, cards, medical debt; payoff-strategy minded, offer-skeptical.",
        seedHints: "student-loan carriers, BNPL users, medical-debt households, consolidation seekers",
      },
      {
        key: "retail-investors",
        name: "Savers & retail investors",
        description: "Actively growing money; from index-fund savers to options gamblers, research-heavy.",
        seedHints: "401k maximizers, FIRE followers, dividend savers, crypto dabblers, first-home savers",
      },
    ],
  },
  {
    key: "life-context",
    name: "Life contexts",
    subdomains: [
      {
        key: "caregivers",
        name: "Caregivers",
        description: "Caring for children, elders, or both; time- and attention-starved, reliability-first buyers.",
        seedHints: "sandwich-generation adults, single parents, special-needs parents, adult children of aging parents",
      },
      {
        key: "accessibility-community",
        name: "Disability & accessibility community",
        description: "Disabled users and advocates; accessibility is adoption's gate, workarounds are daily life.",
        seedHints: "screen-reader users, wheelchair users, chronic-illness patients, Deaf/HoH, neurodivergent adults",
      },
      {
        key: "new-arrivals",
        name: "Immigrants & new arrivals",
        description: "Building life in a new country; bilingual, remittance-sending, credential-rebuilding.",
        seedHints: "recent immigrants, international students staying on, refugees, returning expats",
      },
      {
        key: "military-veterans",
        name: "Military & veterans",
        description: "Service members, vets, and families; relocation-shaped lives, benefits-literate, loyalty-strong.",
        seedHints: "active-duty spouses, recent vets in transition, career NCOs, reservists with day jobs",
      },
    ],
  },
  {
    key: "communities",
    name: "Communities & passions",
    subdomains: [
      {
        key: "gamers",
        name: "Gamers",
        description: "Console, PC, and mobile players; free-to-play literate, monetization-cynical, community-driven.",
        seedHints: "competitive PC gamers, casual mobile players, parents who game, retro collectors, streamers' viewers",
      },
      {
        key: "outdoor-enthusiasts",
        name: "Outdoor enthusiasts",
        description: "Hikers, anglers, climbers; gear-research obsessive, durability-first, brand-tribal.",
        seedHints: "weekend hikers, hunters, trail runners, van-lifers, national-park regulars",
      },
      {
        key: "diy-homeowners",
        name: "DIY & homeowners",
        description: "Fix-it-themselves home people; project-driven spending, YouTube-taught, tool-proud.",
        seedHints: "first-time homeowners, garage tinkerers, gardeners, home-renovation couples, landlords",
      },
      {
        key: "pet-parents",
        name: "Pet parents",
        description: "Pets as family; premium-willing on health, subscription-open, vet-bill scarred.",
        seedHints: "dog and cat households, multi-pet homes, exotic-pet keepers, rescue volunteers, rural working-dog owners",
      },
      {
        key: "sustainability-minded",
        name: "Sustainability-minded",
        description: "Climate and ethics shape purchases; greenwashing detectors, repair-over-replace.",
        seedHints: "zero-wasters, EV owners, secondhand-first shoppers, climate-anxious younger adults, off-grid aspirants",
      },
    ],
  },
];

export function allSubdomains(): Array<Subdomain & { domainKey: string; domainName: string }> {
  return TAXONOMY.flatMap((d) =>
    d.subdomains.map((s) => ({ ...s, domainKey: d.key, domainName: d.name })),
  );
}

export function findSubdomain(domainKey: string, subdomainKey: string): Subdomain | null {
  const domain = TAXONOMY.find((d) => d.key === domainKey);
  return domain?.subdomains.find((s) => s.key === subdomainKey) ?? null;
}

/** `consumers/budget-households` → {domainKey, subdomainKey}; tolerant of bad input. */
export function parsePoolKey(pool: string): { domainKey: string; subdomainKey: string } | null {
  const [domainKey, subdomainKey] = pool.split("/");
  if (!domainKey || !subdomainKey) return null;
  return findSubdomain(domainKey, subdomainKey) ? { domainKey, subdomainKey } : null;
}
