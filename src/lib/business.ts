/**
 * Business identity, single source of truth.
 *
 * Created S-SEO (2026-06): the NAP, contact channels, service list, and
 * service-area towns were previously hard-coded inside BaseLayout.astro. New
 * service + location pages and the schema helpers (src/lib/schema.ts) import
 * from here so the business facts live in exactly one place.
 *
 * HARD RULE: real values only. No invented address (none is published by
 * design), no fabricated reviews/ratings. Real projects only.
 */

export const business = {
  name: 'Winters Code',
  founder: 'Preston Winters',
  /** Public site origin. Mirrors astro.config `site`. No trailing slash. */
  url: 'https://winterscode.com',
  email: 'preston@winterscode.com',
  /** E.164 for tel: + schema. */
  phone: '+15415510731',
  phoneDisplay: '541-551-0731',
  cal: 'https://cal.com/preston-winters',
  github: 'https://github.com/Preston2012',
  /** No street address is published (solo shop, by design). City-level only. */
  locality: 'Bandon',
  region: 'OR',
  regionName: 'Oregon',
  country: 'US',
  priceRange: '$$',
  tagline: 'I build it. I ship it. I maintain it.',
  /** Counties named in the existing LocalBusiness areaServed. */
  counties: ['Coos County', 'Curry County'],
} as const;

/** Profiles for schema `sameAs`. Real profiles only. */
export const sameAs: string[] = [business.github];

// ─────────────────────────────────────────────────────────────
// SERVICES, the Tier-1 spine. slug → /services/<slug>.
// ─────────────────────────────────────────────────────────────
export interface ServiceEntry {
  slug: string;
  /** Display name + H1 noun. */
  name: string;
  /** Nav/footer short label. */
  shortLabel: string;
  /** One-line meta description seed (kept under ~155 with town/qualifiers). */
  blurb: string;
  /** schema.org serviceType string. */
  serviceType: string;
}

export const services: ServiceEntry[] = [
  {
    slug: 'web-design',
    name: 'Web Design',
    shortLabel: 'Web Design',
    blurb:
      'Custom website design for Oregon coast businesses. Mobile-first, built for your customer, not stamped from a template.',
    serviceType: 'Web design',
  },
  {
    slug: 'web-development',
    name: 'Web Development',
    shortLabel: 'Web Development',
    blurb:
      'Hand-written front-end and back-end code. No WordPress, no page builders. Fast, secure, and yours to own.',
    serviceType: 'Web development',
  },
  {
    slug: 'app-development',
    name: 'App Development',
    shortLabel: 'App Development',
    blurb:
      'Cross-platform iOS and Android apps in Flutter. One codebase, two stores. Live products already on the App Store and Play Store.',
    serviceType: 'Mobile app development',
  },
  {
    slug: 'custom-software',
    name: 'Custom Software',
    shortLabel: 'Custom Software',
    blurb:
      'Custom software and SaaS: portals, dashboards, multi-tenant systems, and the business logic off-the-shelf tools cannot cover.',
    serviceType: 'Custom software development',
  },
  {
    slug: 'ai-automation',
    name: 'AI Automation',
    shortLabel: 'AI Automation',
    blurb:
      'Practical AI and automation: intake, replies, lead routing, and integrations between the tools you already use. Built, not bolted on.',
    serviceType: 'AI automation and integration',
  },
  {
    slug: 'seo-performance',
    name: 'SEO & Performance',
    shortLabel: 'SEO & Performance',
    blurb:
      'Core Web Vitals, Lighthouse, and on-page SEO done right. The speed and security most Coos County sites are missing.',
    serviceType: 'SEO and website performance optimization',
  },
];

export const serviceBySlug = (slug: string): ServiceEntry | undefined =>
  services.find((s) => s.slug === slug);

// ─────────────────────────────────────────────────────────────
// TOWNS, the local matrix. Real Coos + Curry County context only.
// Drive times are from Bandon (the shop). Industries are genuine local
// economic drivers, used to differentiate each page honestly.
// ─────────────────────────────────────────────────────────────
export interface TownEntry {
  slug: string;
  name: string;
  county: 'Coos County' | 'Curry County';
  /** Honest drive context from Bandon for the consult/travel section. */
  driveFromBandon: string;
  /** Which published consult band applies (real policy). */
  consultBand: 'in-person-free' | 'county-free-video' | 'deposit-150' | 'deposit-250';
  /** Real local industries / economic drivers (4-6). */
  industries: string[];
  /** Unique, factual local-context paragraph. No fabricated proof. */
  context: string;
  /** Town-specific FAQ. Real answers grounded in policy + practice. */
  faq: { q: string; a: string }[];
  /** Neighboring town slugs for the internal-link web. */
  neighbors: string[];
  /** Which service×town combo pages exist for this town (besides web-design). */
  combos?: string[];
}

export const towns: TownEntry[] = [
  {
    slug: 'coos-bay',
    name: 'Coos Bay',
    county: 'Coos County',
    driveFromBandon: 'about 30 minutes up Highway 101',
    consultBand: 'county-free-video',
    industries: [
      'healthcare',
      'retail',
      'commercial fishing',
      'port and logistics',
      'hospitality',
      'professional services',
    ],
    context:
      'Coos Bay is the largest city on the Oregon coast and the commercial hub of the south coast. Between the deep-water port, Bay Area Hospital, and the Highway 101 retail corridor, it has more small businesses competing for the same local searches than anywhere else in the county. That makes a fast, well-built site worth more here: when a clinic, shop, or charter outranks the WordPress sites around it, the phone rings.',
    faq: [
      {
        q: 'Do you work with Coos Bay businesses in person?',
        a: 'Yes. Coos Bay is about 30 minutes from the shop in Bandon. The first consult is a free 30-minute video call, and I come up to Coos Bay in person when a project calls for it. No travel deposit inside Coos County.',
      },
      {
        q: 'My Coos Bay business already has a website. Is a rebuild worth it?',
        a: 'Often, yes. In an audit of 169 Coos County small-business websites, the average mobile speed score was 61 out of 100 and not one site scored both fast and secure. If your current site is slow or built on a page builder, a custom rebuild usually pays for itself in search visibility and load speed.',
      },
    ],
    neighbors: ['north-bend', 'coquille'],
    combos: ['app-development', 'ai-automation'],
  },
  {
    slug: 'north-bend',
    name: 'North Bend',
    county: 'Coos County',
    driveFromBandon: 'about 35 minutes up Highway 101',
    consultBand: 'county-free-video',
    industries: [
      'hospitality and gaming',
      'retail',
      'air travel and tourism',
      'small business',
      'food and beverage',
    ],
    context:
      'North Bend sits right against Coos Bay and shares its economy, but it has its own draws: the Southwest Oregon Regional Airport (the coast’s main airport), The Mill Casino, and the Pony Village retail area. A lot of North Bend businesses serve travellers who are searching on their phones before they land or check in, so mobile speed and clear booking paths matter more here than almost anywhere else on the coast.',
    faq: [
      {
        q: 'Can you build a site that handles bookings for a North Bend business?',
        a: 'Yes. Booking widgets, reservation forms, and calendar integrations are part of a Pro site build. For travel and hospitality businesses near the airport and casino, I can wire the booking flow so a visitor can act in one or two taps.',
      },
      {
        q: 'How far is North Bend from your shop?',
        a: 'About 35 minutes up Highway 101 from Bandon. First consult is a free video call; in-person meetings in North Bend carry no travel deposit since it is inside Coos County.',
      },
    ],
    neighbors: ['coos-bay', 'coquille'],
    combos: ['app-development', 'ai-automation'],
  },
  {
    slug: 'bandon',
    name: 'Bandon',
    county: 'Coos County',
    driveFromBandon: 'right here, this is home',
    consultBand: 'in-person-free',
    industries: [
      'tourism',
      'golf and hospitality',
      'lodging and vacation rentals',
      'cranberry agriculture',
      'restaurants and seafood',
      'art galleries and retail',
    ],
    context:
      'Bandon is home. The shop is here, my family has been here six generations, and most weeks I am within walking distance of Old Town. The local economy runs on tourism, Bandon Dunes golf, lodging, cranberries, and the restaurants and galleries that serve them. I have already shipped a live site for a Bandon contractor, Sogn Contracting, built in three days. When you hire me for a Bandon project, you get the person who built it sitting across the table, not a ticket queue.',
    faq: [
      {
        q: 'Can we meet in person in Bandon?',
        a: 'Yes, and it is free. Bandon is home base. I will meet at the Warehouse, Bandon Coffee, Broken Anchor, or Bandon Brewing, no deposit, no pitch deck. Small towns run on trust, and that is easier to build face to face.',
      },
      {
        q: 'Have you built for a Bandon business before?',
        a: 'Yes. Sogn Contracting, a 30-year Bandon contractor, is live with a custom site I built in three days that averages 95+ on Lighthouse. That is real, indexed, local work you can go look at.',
      },
    ],
    neighbors: ['coquille', 'coos-bay'],
    combos: ['app-development', 'ai-automation'],
  },
  {
    slug: 'coquille',
    name: 'Coquille',
    county: 'Coos County',
    driveFromBandon: 'about 25 minutes inland on Highway 42S',
    consultBand: 'county-free-video',
    industries: [
      'agriculture and dairy',
      'timber and forestry',
      'local government',
      'healthcare',
      'professional services',
    ],
    context:
      'Coquille is the Coos County seat and the civic centre of the valley. Its economy leans on agriculture, dairy, timber, the Coquille Indian Tribe, and the government and healthcare jobs that come with being the county seat. Businesses here serve a steady local base rather than tourist traffic, so the win is ranking for the everyday searches: the trade, the clinic, the shop people in the valley already need.',
    faq: [
      {
        q: 'Is Coquille too small to bother with SEO?',
        a: 'No, the opposite. Local competition in Coquille is light, which means a fast, properly built site can rank for valley searches quickly. Smaller market, weaker competition, faster results.',
      },
      {
        q: 'How do consults work for a Coquille business?',
        a: 'Coquille is about 25 minutes from Bandon on Highway 42S. First consult is a free video call, and in-person meetings carry no travel deposit since Coquille is inside Coos County.',
      },
    ],
    neighbors: ['myrtle-point', 'coos-bay'],
  },
  {
    slug: 'reedsport',
    name: 'Reedsport',
    county: 'Coos County',
    driveFromBandon: 'about an hour north on Highway 101',
    consultBand: 'county-free-video',
    industries: [
      'tourism and recreation',
      'fishing',
      'lodging',
      'outdoor recreation and dunes',
      'small retail',
    ],
    context:
      'Reedsport sits on the Umpqua River at the gateway to the Oregon Dunes National Recreation Area. The economy runs on dune and river recreation, fishing, lodging, and the businesses that outfit and feed visitors. Travellers planning a dune trip or a fishing day search ahead on their phones, so a Reedsport business that loads fast and answers the question quickly catches them before a competitor does.',
    faq: [
      {
        q: 'Can you help a Reedsport tourism business show up for dune and river searches?',
        a: 'Yes. On-page SEO, fast mobile loads, and clear calls to action are exactly what tourism searches reward. I build the page so a visitor planning a dune or Umpqua trip finds you and can book or call in one tap.',
      },
      {
        q: 'Reedsport is a bit of a drive. Does that change anything?',
        a: 'Reedsport is about an hour from Bandon but still inside Coos County, so the first consult is a free video call and there is no travel deposit. Most of a build happens remotely anyway; I come up in person when it earns the trip.',
      },
    ],
    neighbors: ['coos-bay', 'north-bend'],
  },
  {
    slug: 'myrtle-point',
    name: 'Myrtle Point',
    county: 'Coos County',
    driveFromBandon: 'about 35 minutes inland on Highway 42',
    consultBand: 'county-free-video',
    industries: [
      'agriculture and ranching',
      'dairy',
      'timber and myrtlewood',
      'local trades and services',
      'small retail',
    ],
    context:
      'Myrtle Point sits in the upper Coquille Valley, ranch and dairy country, with a long history in timber and myrtlewood. Businesses here are trades, farms, and family shops serving a tight rural community. There is almost no local web competition, which means a clean, fast site can own the valley’s searches with very little standing in the way.',
    faq: [
      {
        q: 'Is it worth building a real site for a small Myrtle Point business?',
        a: 'Yes. Because so few Myrtle Point businesses have a fast, modern site, the bar to rank locally is low. A custom site here often outranks everything around it from day one, for a fraction of agency cost.',
      },
      {
        q: 'How do we meet?',
        a: 'Myrtle Point is about 35 minutes from Bandon on Highway 42. First consult is a free video call; in-person meetings carry no deposit since it is inside Coos County.',
      },
    ],
    neighbors: ['coquille', 'coos-bay'],
  },
  {
    slug: 'port-orford',
    name: 'Port Orford',
    county: 'Curry County',
    driveFromBandon: 'about 35 minutes south on Highway 101',
    consultBand: 'county-free-video',
    industries: [
      'commercial fishing',
      'arts and galleries',
      'tourism',
      'lodging',
      'restaurants and seafood',
    ],
    context:
      'Port Orford is one of the oldest townsites on the Oregon coast and home to a working dolly dock, where the fishing fleet is hoisted straight out of the water. Between the fishery, a strong arts community, and Cape Blanco tourism, it punches above its size. Visitors and gallery buyers research before they drive out, so a Port Orford business that presents cleanly online turns that research into a stop.',
    faq: [
      {
        q: 'Do you serve Curry County, not just Coos?',
        a: 'Yes. Port Orford is in Curry County, which is part of my core service area. First consult is a free video call, and in-person meetings here carry no travel deposit.',
      },
      {
        q: 'Can you build a gallery or portfolio-style site?',
        a: 'Yes. Image-forward galleries that still load fast are a strong fit for Port Orford’s arts and seafood businesses. I optimize the photography so the site stays quick on rural connections without looking compressed.',
      },
    ],
    neighbors: ['bandon', 'gold-beach'],
  },
  {
    slug: 'gold-beach',
    name: 'Gold Beach',
    county: 'Curry County',
    driveFromBandon: 'about 70 minutes south on Highway 101',
    consultBand: 'deposit-150',
    industries: [
      'tourism and recreation',
      'fishing and river guides',
      'lodging',
      'restaurants',
      'outdoor outfitters',
    ],
    context:
      'Gold Beach sits at the mouth of the Rogue River, famous for jet-boat tours, salmon fishing, and the lodges and guides that run them. The whole local economy is built on visitors who plan their trip online weeks ahead. For a Gold Beach guide, lodge, or restaurant, the website is the storefront travellers see first, and a fast, clear one wins the booking before the visitor ever reaches town.',
    faq: [
      {
        q: 'Gold Beach is a long drive. Can you still take the project?',
        a: 'Yes. Gold Beach is about 70 minutes from Bandon, still in my core Curry County area. The first consult is a free video call. If you want me on-site, an in-person visit carries a $250 travel deposit that credits straight back to your project when you sign.',
      },
      {
        q: 'Can you build a site that takes bookings for a Rogue River business?',
        a: 'Yes. Booking flows, trip calendars, and inquiry forms are core to a tourism build. I make it so a traveller planning a Rogue jet-boat or fishing trip can see availability and book or message you in a tap or two.',
      },
    ],
    neighbors: ['port-orford', 'bandon'],
  },
];

export const townBySlug = (slug: string): TownEntry | undefined =>
  towns.find((t) => t.slug === slug);

/** Towns that have dedicated combo pages for a given service slug. */
export const townsWithCombo = (serviceSlug: string): TownEntry[] =>
  towns.filter((t) => t.combos?.includes(serviceSlug));
