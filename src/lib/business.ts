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
      'Custom front-end and back-end code. No WordPress, no page builders. Fast, secure, and yours to keep.',
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
  /**
   * Per-industry note: the industry plus what that business type needs online,
   * framed for THIS town. Renders as the "Built for X's businesses" detail list.
   * Unique per town. When present, the template uses this over the bare list.
   */
  industriesDetail?: { name: string; note: string }[];
  /** Unique, factual local-context paragraph. No fabricated proof. */
  context: string;
  /**
   * A second unique section: the specific local angle on why web presence
   * matters for THIS town's businesses (competition, traveler search, market
   * size, geography). 2-4 sentences. Factual, no fabricated proof.
   */
  localAngle?: { heading: string; body: string };
  /**
   * A third unique section: the concrete local business scene. Named districts,
   * landmarks, anchors, and the real competitive picture for THIS town. This is
   * the highest-uniqueness block (no parallel on other towns), added to push
   * per-page duplication well under 30% while giving Google genuine local
   * relevance signals. 3-5 sentences, all factual, no fabricated proof.
   */
  localScene?: { heading: string; body: string };
  /**
   * Town-specific framing for the audit/opportunity block. Replaces the
   * identical shared paragraph so each page reads differently. Factual.
   */
  auditNote?: string;
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
    industriesDetail: [
      {
        name: 'Healthcare',
        note: 'Bay Area Hospital is the largest employer on the south coast, and the clinics, practices, and specialists around it are some of the most-searched local businesses in the county. A clear, fast, trustworthy site matters more in healthcare than almost anywhere.',
      },
      {
        name: 'Retail',
        note: 'The Highway 101 retail corridor is the densest in the county, which means the most competition for the same local searches. Standing out is less about ads and more about being the fast, findable option when someone looks.',
      },
      {
        name: 'Commercial fishing and seafood',
        note: 'Coos Bay is the best natural harbor between San Francisco and Puget Sound, and seafood businesses here sell fresh, frozen, and to markets across the country. A site that handles wholesale and retail clearly is worth building right.',
      },
      {
        name: 'Port and logistics',
        note: 'The deep-water port and rail line anchor a logistics economy that most of the coast does not have. The B2B businesses around it need sites that read as credible to partners, not just to walk-in customers.',
      },
      {
        name: 'Professional services',
        note: 'Lawyers, accountants, agencies, and trades serving the regional hub compete on trust. A site that loads fast and looks like the real thing closes that trust gap before the first call.',
      },
    ],
    context:
      'Coos Bay is the largest city on the Oregon coast, around 16,000 people, and the commercial hub of the south coast. Between the deep-water port, Bay Area Hospital, Southwestern Oregon Community College, and the Highway 101 retail corridor, it has more small businesses competing for the same local searches than anywhere else in the county. Top employers run from the hospital and Walmart to The Mill Casino and Pacific Seafood. That density cuts both ways: more competition, but a bigger payoff when your site is the fast one that outranks the template sites around it.',
    localAngle: {
      heading: 'Why it matters in Coos Bay',
      body: 'Coos Bay is the one market on the coast big enough to have real local-search competition. In a small town you can rank by default. Here, a clinic, shop, or contractor is fighting a dozen others for the same query, and most of them are renting slow template sites. That is the opening: speed, clean structure, and security are a low bar in this market, and clearing it puts you ahead of competitors who never did the work.',
    },
    localScene: {
      heading: 'The business scene in Coos Bay',
      body:
        'The commercial core runs along Highway 101 through downtown, with the Coos History Museum and the boardwalk on the waterfront and the broader retail strip stretching toward the Pony Village area in neighboring North Bend. Bay Area Hospital anchors a whole cluster of clinics and practices, Southwestern Oregon Community College brings steady foot traffic, and the port and Coos Bay Rail Line anchor the industrial side. Charleston, just west, adds the working marina and seafood trade. It is the one place on the south coast where multiple businesses chase the same search, which is exactly why being the fast, well-built option pays here when it would not matter in a smaller town.',
    },
    auditNote:
      'I audited 169 Coos County small-business websites with Google Lighthouse and Mozilla Observatory. Not one site scored both fast and secure, and the best security grade in the county was a B. Coos Bay has the most businesses and the most competition in that sample, which means it also has the most room to win by simply being the fast, secure option.',
    faq: [
      {
        q: 'Do you work with Coos Bay businesses in person?',
        a: 'Yes. Coos Bay is about 30 minutes from the shop in Bandon. The first consult is a free 30-minute video call, and I come up to Coos Bay in person when a project calls for it. No travel deposit inside Coos County.',
      },
      {
        q: 'My Coos Bay business already has a website. Is a rebuild worth it?',
        a: 'Often, yes. If your current site is slow, built on a page builder, or missing basic security, a custom rebuild usually pays for itself in search visibility and load speed. The free audit shows you exactly where your site stands before you decide.',
      },
      {
        q: 'Coos Bay is competitive. Can a new site actually move my ranking?',
        a: 'It can, because most of the competition is slow and templated. Google rewards fast, secure, well-structured sites, and that is exactly the gap in this market. I cannot promise a position, but I can promise your site will be the technically better one, which is what ranking is built on.',
      },
      {
        q: 'Do you build for clinics and healthcare practices?',
        a: 'Yes. Healthcare is the biggest sector in Coos Bay and a good fit, because the whole job is loading fast and reading as trustworthy. I build with security defaults on every site, which matters more when patients are the audience.',
      },
    ],
    neighbors: ['north-bend', 'coquille'],
    combos: ['ai-automation'],
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
    industriesDetail: [
      {
        name: 'Air travel and tourism',
        note: 'North Bend has the only airport on the Oregon coast with scheduled commercial airline service, the Southwest Oregon Regional Airport, with flights to Portland and San Francisco. Businesses here reach visitors who are searching from a plane seat or a rental car, so a fast mobile site is the first impression before anyone arrives.',
      },
      {
        name: 'Hospitality and gaming',
        note: 'The Mill Casino Hotel, run by the Coquille Indian Tribe, anchors the local hospitality economy. The restaurants, lodging, and services around it compete for traveler attention, where a clear booking path and fast load decide who gets the visit.',
      },
      {
        name: 'Retail',
        note: 'Pony Village Mall is the largest enclosed shopping center on the coast, and the retail around it serves the whole regional trade area. Being the fast, findable option online is how local retail competes with both the mall and the internet.',
      },
      {
        name: 'Food and beverage',
        note: 'Restaurants and cafes here serve a mix of locals and travelers passing through on Highway 101. The menu, hours, and map pin have to be right and fast, because a hungry traveler decides in seconds.',
      },
    ],
    context:
      'North Bend sits directly against Coos Bay, the two cities running together as the largest urban area on the Oregon coast, and shares much of that economy. But North Bend has its own assets: the Southwest Oregon Regional Airport, the only one on the Oregon coast with scheduled airline service, The Mill Casino Hotel run by the Coquille Indian Tribe, and Pony Village Mall, the coast\u2019s largest enclosed shopping center. A lot of North Bend businesses serve travelers searching on their phones before they land or check in, which makes mobile speed and a clear booking path matter more here than almost anywhere on the coast.',
    localAngle: {
      heading: 'Why it matters in North Bend',
      body: 'North Bend is a gateway town. The airport and the casino bring in people who do not live here and are deciding where to eat, stay, and shop from a phone, often before they have even landed. That is a different kind of visitor than a local who already knows you. They judge on the first screen, and a slow or confusing site loses them to whoever loads faster. For a North Bend business, mobile speed is not a nicety, it is the storefront.',
    },
    localScene: {
      heading: 'The business scene in North Bend',
      body:
        'North Bend\u2019s commercial weight sits in two places: the Pony Village Mall area, the largest enclosed shopping center on the coast and the retail hub for the whole region, and the Highway 101 corridor running down toward the McCullough Bridge. The Mill Casino Hotel on the bay is a destination economy of its own, drawing lodging, dining, and event traffic. The Southwest Oregon Regional Airport and the businesses around it serve arriving travelers directly. Because so many North Bend customers are passing through or flying in rather than local regulars, the first thing they see is a phone screen, which makes a fast, clear site the actual front door.',
    },
    auditNote:
      'Across the Coos County sites Google Lighthouse could score, the average mobile speed was 61 out of 100. That number stings more in North Bend than most places, because so many businesses here are pitching to travelers on phones and slow airport or rental-car connections. The site that loads first is the one that gets the booking.',
    faq: [
      {
        q: 'Can you build a site that handles bookings for a North Bend business?',
        a: 'Yes. Booking widgets, reservation forms, and calendar integrations are part of a site build. For travel and hospitality businesses near the airport and casino, I can wire the booking flow so a visitor can act in one or two taps.',
      },
      {
        q: 'How far is North Bend from your shop?',
        a: 'About 35 minutes up Highway 101 from Bandon. First consult is a free video call; in-person meetings in North Bend carry no travel deposit since it is inside Coos County.',
      },
      {
        q: 'A lot of my customers fly in. Does that change how you build my site?',
        a: 'It does. Visitors arriving through the airport are often on slow connections and small screens, deciding fast. I build for that first: the site loads quickly on a phone, the key action is obvious, and nothing important hides behind a slow script. That is the difference between catching that traveler and losing them.',
      },
      {
        q: 'My business is in both North Bend and Coos Bay searches. Is that a problem?',
        a: 'No, it is an advantage if the site is built right. The two cities share a trade area, so a well-structured site can show up for both. I set up the local signals and structure so you are not fighting yourself across the two markets.',
      },
    ],
    neighbors: ['coos-bay', 'coquille'],
    combos: [],
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
    industriesDetail: [
      {
        name: 'Golf and hospitality',
        note: 'Bandon Dunes pulls in visitors from around the world, and the businesses around it live or die by what those visitors find when they search at the resort. A fast site that loads on a phone at the first tee is worth real money here.',
      },
      {
        name: 'Lodging and vacation rentals',
        note: 'Inns, motels, and short-term rentals compete for the same booking searches. Clear photos, a booking path that works in one or two taps, and a site that loads before the visitor gives up are the whole game.',
      },
      {
        name: 'Restaurants and seafood',
        note: 'Old Town runs on foot traffic and word of mouth, but the menu, the hours, and the map pin still have to be right online. Most of the failures I see are a slow site or a menu buried in a PDF.',
      },
      {
        name: 'Art galleries and retail',
        note: 'Second Street Gallery and the Old Town shops sell on character. A site should carry that character, not flatten it into a template every other gallery is also renting.',
      },
      {
        name: 'Cranberry agriculture',
        note: 'Bandon grows about 95 percent of Oregon\u2019s cranberries. Growers and the businesses built around the harvest need straightforward, durable sites more than they need anything flashy.',
      },
    ],
    context:
      'Bandon is home. The shop is here, my family has been here six generations, and most weeks I am within walking distance of Old Town. The local economy runs on tourism, Bandon Dunes golf, lodging, cranberries, and the restaurants and galleries that serve them. Tourism employs roughly a third of the town, and the ten square blocks of Old Town are where most of that money changes hands. I have already built a live site for a Bandon contractor, Sogn Contracting, in three days. When you hire me for a Bandon project, you get the person who built it sitting across the table, not a ticket queue.',
    localAngle: {
      heading: 'Why it matters in Bandon',
      body: 'Bandon punches above its size online because the visitors are global but the businesses are small. A golfer booking a room or a couple picking a dinner spot is searching on a phone, often from the resort or the road, and they decide in seconds. The shops that win those seconds are not the ones with the prettiest logo, they are the ones whose site loads fast and answers the question. That is a low bar most local sites still miss, which is exactly the opening.',
    },
    localScene: {
      heading: 'The business scene in Bandon',
      body:
        'Most of the commercial energy is in Old Town, the ten-block grid down by the harbor: Second Street Gallery and Art by the Sea on the gallery side, Bandon Coffee, Cranberry Sweets, Foley\u2019s, Tony\u2019s Crab Shack and the Bandon Fish Market on the food side, plus the shops along Baltimore and First. Out on Round Lake Road, Bandon Dunes is its own economy of pro shops, lodging, and dining. Then there is Highway 101 frontage and Face Rock Creamery on the way in. Three distinct commercial zones, three different kinds of customer, and almost none of those businesses have a site that loads fast on a phone. That is the gap a custom build steps into.',
    },
    auditNote:
      'I live and work in Bandon, so I have looked at most of the sites in town. The pattern is the same one I found across Coos County: rented template sites that load slowly and bury the basics. In a tourist town where the visitor decides in seconds, that is the difference between a booking and a back button.',
    faq: [
      {
        q: 'Can we meet in person in Bandon?',
        a: 'Yes, and it is free. Bandon is home base. I will meet at the Warehouse, Bandon Coffee, Broken Anchor, or Bandon Brewing, no deposit, no pitch deck. Small towns run on trust, and that is easier to build face to face.',
      },
      {
        q: 'Have you built for a Bandon business before?',
        a: 'Yes. Sogn Contracting, a 30-year Bandon contractor, is live with a custom site I built in three days that averages 95+ on Lighthouse. That is real, indexed, local work you can go look at.',
      },
      {
        q: 'My business is seasonal. Does a custom site still make sense?',
        a: 'Yes, and arguably more so. A seasonal business has a narrow window to capture searches, so the site has to be fast and findable when the visitors are actually here. I build it once, and it stays fast year round. A care plan can keep it current without you touching it, if you want one.',
      },
      {
        q: 'Do you work with Bandon Dunes area lodging and rentals?',
        a: 'Yes. Lodging and vacation rentals are a good fit because the whole job is turning a search into a booking. I can wire a booking flow, keep the photos sharp, and make sure the site loads before a visitor on resort wifi gives up and books somewhere else.',
      },
    ],
    neighbors: ['coquille', 'coos-bay'],
    combos: ['app-development'],
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
    industriesDetail: [
      {
        name: 'Local government and the county seat',
        note: 'Coquille has been the Coos County seat since 1896, which means courthouse, county offices, and the steady civic foot traffic that comes with them. Businesses serving that base need to be findable for plain, everyday local searches, not tourist queries.',
      },
      {
        name: 'Agriculture and dairy',
        note: 'The Coquille Valley is farm and dairy country. The suppliers, services, and shops that support working farms do better with a simple, fast site than with anything flashy.',
      },
      {
        name: 'Timber and forestry',
        note: 'Coquille grew on sawmills and plywood, and wood products are still part of the economy. The trades and contractors tied to it sell on reputation, and a clean site backs that reputation up online.',
      },
      {
        name: 'Healthcare and professional services',
        note: 'As the county seat, Coquille carries clinics, offices, and professional services that serve the whole valley. For these, loading fast and reading as credible is most of the job.',
      },
    ],
    context:
      'Coquille is the Coos County seat and the civic center of the valley, around 4,000 people. It has been the county seat since 1896, and its economy leans on agriculture, dairy, timber, the Coquille Indian Tribe, and the government and healthcare jobs that come with the courthouse. This is the town of the Sawdust Theatre and the Gay Nineties celebration, a working valley community rather than a tourist stop. Businesses here serve a steady local base, so the win is ranking for the everyday searches: the trade, the clinic, the shop people in the valley already need.',
    localAngle: {
      heading: 'Why it matters in Coquille',
      body: 'Coquille is an inland working town, not a tourist economy, and that shapes the whole strategy. The searches that matter are local and practical: a resident looking for a contractor, a clinic, a service in the valley. Competition for those searches is light because so few valley businesses have a fast, modern site. That is the opening. A properly built site can own Coquille searches quickly, with very little standing in the way, and the county-seat foot traffic means those searches have real intent behind them.',
    },
    localScene: {
      heading: 'The business scene in Coquille',
      body:
        'Coquille\u2019s commercial life centers on the downtown grid around Front Street and First Street, near the Coquille River and the 1922 river bridge, with the county courthouse drawing daily civic traffic. The Sawdust Theatre and the Coquille Valley Museum on North Central anchor the cultural side, and the trades, feed and farm services, the clinic, and the everyday shops serve a working valley rather than tourists. It is a town where customers already know the businesses by name, so the job of a site is less about discovery and more about being findable and reachable when a neighbor finally searches you up. With almost no local web competition, that is a low bar to clear and own.',
    },
    auditNote:
      'In the audit I ran across 169 Coos County small-business sites, the inland valley towns like Coquille had the weakest web presence of all, mostly slow template sites or no site at all. For a Coquille business that is good news: the bar to rank locally is on the floor, and clearing it does not take much.',
    faq: [
      {
        q: 'Is Coquille too small to bother with SEO?',
        a: 'No, the opposite. Local competition in Coquille is light, which means a fast, properly built site can rank for valley searches quickly. Smaller market, weaker competition, faster results.',
      },
      {
        q: 'How do consults work for a Coquille business?',
        a: 'Coquille is about 25 minutes from Bandon on Highway 42S. First consult is a free video call, and in-person meetings carry no travel deposit since Coquille is inside Coos County.',
      },
      {
        q: 'Most of my customers are local. Do I really need a website?',
        a: 'Yes, because local is exactly who searches you first. A Coquille resident deciding between you and the next option pulls up their phone, and if you are not there or your site is slow, you lose to whoever is. The site is not for tourists, it is for the neighbors already looking for you.',
      },
      {
        q: 'I run a trade or service out of Coquille. What kind of site fits?',
        a: 'Usually a straightforward site: what you do, where you work, how to reach you, fast on a phone and easy for Google to read. No bloat, no plugins to babysit. For a valley trade, that is plenty to rank and turn searches into calls.',
      },
    ],
    neighbors: ['myrtle-point', 'coos-bay'],
  },
  {
    slug: 'reedsport',
    name: 'Reedsport',
    county: 'Douglas County',
    driveFromBandon: 'about an hour north on Highway 101',
    consultBand: 'county-free-video',
    industries: [
      'tourism and recreation',
      'fishing',
      'lodging',
      'outdoor recreation and dunes',
      'small retail',
    ],
    industriesDetail: [
      {
        name: 'Dunes and outdoor recreation',
        note: 'Reedsport is the headquarters town for the Oregon Dunes National Recreation Area, and a cluster of businesses exists to outfit ATV riders, campers, and hikers. These live on visitors who plan ahead online, so a fast site that answers the trip question wins the booking.',
      },
      {
        name: 'Fishing and the Umpqua',
        note: 'The Umpqua is the largest navigable river between the Sacramento and the Columbia, and one of the bigger recreational fishing ports on the coast. Guides, charters, and tackle shops here need to be findable the moment someone plans a fishing day.',
      },
      {
        name: 'Lodging',
        note: 'Motels, RV parks, and rentals fill up around DuneFest and the summer season. A clear booking path and fast mobile load are the difference between a reserved room and a back button.',
      },
      {
        name: 'Small retail and the waterfront',
        note: 'Old Town Reedsport keeps early-1900s storefronts now filled with diners, galleries, and shops. Right hours, right map pin, and a quick-loading site catch both locals and the road traffic on Highway 101.',
      },
    ],
    context:
      'Reedsport sits on the Umpqua River at the gateway to the Oregon Dunes National Recreation Area, about 4,300 people, and it is in Douglas County rather than Coos. It calls itself the Gateway to the Dunes and the Chainsaw Carving Capital of Oregon, and it hosts the dunes recreation area headquarters. The economy ran on timber until the Gardiner paper mill closed in 1999, and it has rebuilt around dune and river recreation, fishing, lodging, and the businesses that outfit and feed visitors. Events like DuneFest and the chainsaw carving championships draw thousands.',
    localAngle: {
      heading: 'Why it matters in Reedsport',
      body: 'Reedsport is a trip-planning town. Most of its visitors are deciding from home, days or weeks out, where to stay, who to fish with, where to rent an ATV. That decision happens on a phone, through search, before anyone gets near the dunes. A Reedsport business that loads fast and answers the question quickly catches that visitor while a slow competitor loses them. The tourism economy here is seasonal and competitive, which makes being the findable, fast option worth real money in the summer window.',
    },
    localScene: {
      heading: 'The business scene in Reedsport',
      body:
        'The commercial center is Old Town along the riverfront, where early-1900s wooden storefronts now hold diners, burger joints, galleries, and motels, with the Umpqua Discovery Center anchoring the waterfront. A cluster of businesses exists specifically to outfit the dunes: ATV rentals, repair, fuel, and gear, plus the RV parks and campgrounds toward Winchester Bay. Highway 38 and 101 meet right here, so traffic funnels through town on the way to the dunes or the elk-viewing area at Dean Creek. The customers are overwhelmingly visitors planning ahead, which is exactly the kind of searcher a fast, findable site captures and a slow one loses.',
    },
    auditNote:
      'The same pattern from my 169-site Coos County audit holds just north in Reedsport: most local tourism sites are slow template builds that bury the booking. In a town where the visitor decides online before the trip, a fast site that gets to the point is a direct advantage over the businesses that never did the work.',
    faq: [
      {
        q: 'Can you help a Reedsport tourism business show up for dune and river searches?',
        a: 'Yes. On-page SEO, fast mobile loads, and clear calls to action are exactly what tourism searches reward. I build the page so a visitor planning a dune or Umpqua trip finds you and can book or call in one tap.',
      },
      {
        q: 'Reedsport is a bit of a drive. Does that change anything?',
        a: 'Reedsport is about an hour north of Bandon. The first consult is a free 30-minute video call with no deposit. Most of a build happens remotely anyway, and I come up in person when the project earns the trip.',
      },
      {
        q: 'My business is seasonal around the dunes. Is a site worth it year round?',
        a: 'Yes, because the booking decisions for your busy season are made in the off season, online. A fast, findable site works while you are closed for the winter, capturing the searches that turn into summer reservations. Build it once, it earns through the quiet months.',
      },
      {
        q: 'Can you handle bookings for an ATV rental or fishing charter?',
        a: 'Yes. Booking widgets, trip calendars, and inquiry forms are part of a Pro build. For a dune or Umpqua business, I wire it so a visitor can check availability and reserve or message you in a tap or two, before they have left home.',
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
    industriesDetail: [
      {
        name: 'Agriculture, ranching, and dairy',
        note: 'Myrtle Point sits in ranch and dairy country in the upper Coquille Valley. The feed stores, equipment services, and trades that keep farms running are the backbone here, and they win on being reliable and easy to reach, online included.',
      },
      {
        name: 'Timber and myrtlewood',
        note: 'The town calls itself the heart of the myrtlewoods, and wood products run deep in its history. Makers and shops tied to that craft sell on character, which a real site carries and a template flattens.',
      },
      {
        name: 'Local trades and services',
        note: 'Most Myrtle Point businesses are family trades and services for a tight rural community. A clean site that loads fast and lists what you do and how to reach you is most of what they need to get found.',
      },
      {
        name: 'Small retail',
        note: 'Main-street shops serving locals and the travelers passing through on Highway 42 toward the coast. Right hours, right map pin, fast load, and they catch both.',
      },
    ],
    context:
      'Myrtle Point sits in the upper Coquille Valley, ranch and dairy country, about 2,500 people on a promontory above the river. It calls itself the Hub of Coos County for its spot on Highway 42, the road travelers take from the I-5 corridor out to the South Coast beaches. The economy has long run on timber, dairy, and agriculture, with retail and healthcare leading local jobs now and the school district as the biggest single employer. Businesses here are trades, farms, and family shops serving a tight rural community.',
    localAngle: {
      heading: 'Why it matters in Myrtle Point',
      body: 'Two things make Myrtle Point a strong play despite its size. First, almost no local business has a fast, modern site, so web competition is close to zero and a clean build can own the valley searches from day one. Second, the town is a gateway: travelers heading to the coast on Highway 42 pass straight through, and a business that shows up well online catches some of that pass-through traffic on top of the local base. Low competition plus a steady road of visitors is a better setup than the population number suggests.',
    },
    localScene: {
      heading: 'The business scene in Myrtle Point',
      body:
        'Commercial life runs along Spruce Street and the historic downtown grid: Myrtle Point Ace Hardware, Cherry Creek Floral, the Spruce Street Bar and Grill, the Railroad Cafe, and the accountants and trades that serve the valley. The dome-roofed Coos County Logging Museum at Maple and 7th, built in 1910 and on the National Register, is the town landmark, and the Coos County Fair and Rodeo is the event that fills the streets each summer. These are family businesses serving neighbors and the traffic passing through on Highway 42, and almost none have a real website. For most of them, being findable at all would put them ahead of every competitor in town.',
    },
    auditNote:
      'Across the 169 Coos County sites I audited, the small inland towns had the thinnest web presence of all, and Myrtle Point was squarely in that group. For a business here it is the easiest kind of win: most competitors have a slow template site or none, so a fast custom site can outrank everything around it without much of a fight.',
    faq: [
      {
        q: 'Is it worth building a real site for a small Myrtle Point business?',
        a: 'Yes. Because so few Myrtle Point businesses have a fast, modern site, the bar to rank locally is low. A custom site here often outranks everything around it from day one, for a fraction of agency cost.',
      },
      {
        q: 'How do we meet?',
        a: 'Myrtle Point is about 35 minutes from Bandon on Highway 42. First consult is a free video call; in-person meetings carry no deposit since it is inside Coos County.',
      },
      {
        q: 'Can a site help me catch the traffic passing through on Highway 42?',
        a: 'It can. Travelers heading to the coast often search ahead for food, fuel, or a stop, and a fast site with the right local signals puts you in front of them. You are already on the road they take, the site just makes sure they find you on it.',
      },
      {
        q: 'I mostly serve farms and ranches. What should my site even say?',
        a: 'Keep it plain and useful: what you do, the area you cover, how fast you respond, how to reach you. Farm and ranch customers want reliable and reachable, not slick. I build it fast and simple so it loads anywhere, including out where the signal is weak.',
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
    industriesDetail: [
      {
        name: 'Commercial fishing and the dolly dock',
        note: 'Port Orford has the only dolly dock on the West Coast, where boats are craned out of the water and parked on trailers, and roughly 30 vessels land near $5 million of seafood a year. The fabrication, supply, and seafood businesses around that fleet need straightforward, durable sites.',
      },
      {
        name: 'Arts and galleries',
        note: 'For its size, Port Orford has a strong working-artist community with several artist-owned galleries. These sell on the work itself, so an image-forward site that stays fast is a genuine fit, not a luxury.',
      },
      {
        name: 'Tourism and the Wild Rivers Coast',
        note: 'Cape Blanco, Humbug Mountain, storm watching, and salmon fishing on the Elk and Sixes rivers draw visitors who plan ahead. A site that loads fast and answers the trip question turns that planning into a stop.',
      },
      {
        name: 'Lodging and restaurants',
        note: 'A small set of inns, rentals, and seafood spots serve those visitors. With few of them online well, the one that presents cleanly and loads fast gets an outsized share of the bookings.',
      },
    ],
    context:
      'Port Orford is the westernmost city in the contiguous United States and one of the oldest townsites on the Oregon coast, around 1,100 people in Curry County. It is home to the only dolly dock on the West Coast, where the fishing fleet is hoisted straight out of the water by crane and parked on the dock. Between a working fishery landing near $5 million a year, a strong artist community with several galleries, and Cape Blanco tourism on the Wild Rivers Coast, it punches well above its size. The economy has shifted over time from timber toward fishing, tourism, and a growing retirement and service base.',
    localAngle: {
      heading: 'Why it matters in Port Orford',
      body: 'Port Orford is tiny and remote, which is exactly why a good site pays off. Visitors and gallery buyers research before they make the drive out here, often from well away, because nobody ends up in Port Orford by accident. That means the decision to stop, book, or buy is made online, ahead of time. With very few local businesses presenting well on the web, the one that loads fast and looks the part captures a disproportionate share of that planned-ahead traffic. Small market, light competition, high-intent visitors.',
    },
    localScene: {
      heading: 'The business scene in Port Orford',
      body:
        'For a town of a thousand people, Port Orford packs a lot into a few blocks along Highway 101 and down at the port: the working dolly dock with its commercial fleet, several artist-owned galleries, a handful of seafood spots and cafes, and the inns and rentals that serve Cape Blanco and Humbug Mountain visitors. The OSU Field Station at the port adds a small research presence. It is a tight, self-selecting market where almost everyone arriving has researched the trip first, so the few businesses that present well online quietly take the lion\u2019s share of the planned-ahead visitor spend.',
    },
    auditNote:
      'Curry County sites were not in my 169-site Coos County sample, but the pattern out here is the same or thinner: small coastal businesses on slow template platforms, or with no site at all. For a Port Orford business that is the opening. There is almost nothing to outrank, so a fast, clean site can own the searches that matter with little resistance.',
    faq: [
      {
        q: 'Do you serve Curry County, not just Coos?',
        a: 'Yes. Port Orford is in Curry County, which is part of my core service area. First consult is a free video call, and in-person meetings here carry no travel deposit.',
      },
      {
        q: 'Can you build a gallery or portfolio-style site?',
        a: 'Yes. Image-forward galleries that still load fast are a strong fit for Port Orford’s arts and seafood businesses. I optimize the photography so the site stays quick on rural connections without looking compressed.',
      },
      {
        q: 'We are pretty remote. Will customers really find the site?',
        a: 'They will, and remoteness is the reason it works. People research Port Orford before they drive out, so your site is doing its job exactly when someone is deciding whether to make the trip. Being the fast, clear result is how you turn that search into a visit.',
      },
      {
        q: 'I run a small seafood or fishing business off the dock. What fits?',
        a: 'Usually a clean, simple site: what you catch or sell, how to buy or book, how to reach you, fast on a phone. The dolly dock and the fishery are a real story worth telling plainly. I keep it quick-loading so it works even on the spotty signal out at the port.',
      },
    ],
    neighbors: ['bandon', 'gold-beach'],
  },
  {
    slug: 'gold-beach',
    name: 'Gold Beach',
    county: 'Curry County',
    driveFromBandon: 'about 70 minutes south on Highway 101',
    consultBand: 'deposit-250',
    industries: [
      'tourism and recreation',
      'fishing and river guides',
      'lodging',
      'restaurants',
      'outdoor outfitters',
    ],
    industriesDetail: [
      {
        name: 'River guides and jet-boat tours',
        note: 'Gold Beach is the launch point for Rogue River jet-boat tours, a tradition since 1958, with operators carrying tens of thousands of visitors up the river each summer. These businesses live entirely on bookings made online ahead of the trip.',
      },
      {
        name: 'Fishing and charters',
        note: 'The Rogue, Elk, and Sixes rivers are known for some of the best salmon and steelhead fishing in the country, plus ocean charters out of the port. Guides and charters here need to be the findable, bookable option the moment someone plans a fishing trip.',
      },
      {
        name: 'Lodging',
        note: 'Lodges and motels along the Rogue and the coast fill in a short, intense summer season. A clear booking path and fast load decide who captures that window.',
      },
      {
        name: 'Restaurants and outfitters',
        note: 'The food spots and gear outfitters serve a flow of seasonal visitors plus locals. Right hours, right map pin, and a fast site catch the traveler deciding on the fly.',
      },
    ],
    context:
      'Gold Beach sits at the mouth of the Rogue River and is the county seat of Curry County, around 2,300 people. It is famous for Rogue River jet-boat tours, run from the harbor since 1958, the first commercial jet-boat operation in the country, plus salmon and steelhead fishing and the lodges and guides that run them. The town took its name from gold once panned in the beach sand, but the modern economy is built almost entirely on visitors: the Wild and Scenic Rogue, the Patterson Memorial Bridge, and a short, busy summer season carry it.',
    localAngle: {
      heading: 'Why it matters in Gold Beach',
      body: 'Gold Beach runs on a three-month season, and nearly every dollar of it is decided online in advance. A traveler picks the jet-boat operator, the lodge, the fishing guide weeks ahead from a phone, often from another state. For a Gold Beach business, the website is the storefront the visitor sees first and judges fastest. A fast, clear site that takes a booking wins the reservation before anyone reaches town, and in a season this short, losing that first impression to a slow site is losing the whole year on that customer.',
    },
    localScene: {
      heading: 'The business scene in Gold Beach',
      body:
        'The commercial spine is Highway 101 through town and the harbor at the mouth of the Rogue, where Jerry\u2019s Rogue Jets has launched tours since 1958 and the fishing charters and guides tie up. Lodges and motels line the river and the coast, the Curry County courthouse sits in town as the county seat, and the Patterson Memorial Bridge is the landmark on the way in. Nearly every storefront is pointed at the summer visitor, whether that is a jet-boat seat, a guided salmon trip, or a riverfront room. With the whole year riding on a few months of online-booked trips, the business with the faster, clearer site is the one that fills the calendar first.',
    },
    auditNote:
      'Gold Beach was not in my 169-site Coos County audit, but as the most tourism-dependent town on this list it has the most to lose from a slow site. When the entire year rides on a short summer of online-booked trips, a homepage that loads slowly on a phone is not a small problem, it is the booking going to whoever loaded faster.',
    faq: [
      {
        q: 'Gold Beach is a long drive. Can you still take the project?',
        a: 'Yes. Gold Beach is about 70 minutes from Bandon, still in my core Curry County area. The first consult is a free video call. If you want me on-site, an in-person visit carries a $250 travel deposit that credits straight back to your project when you sign.',
      },
      {
        q: 'Can you build a site that takes bookings for a Rogue River business?',
        a: 'Yes. Booking flows, trip calendars, and inquiry forms are core to a tourism build. I make it so a traveller planning a Rogue jet-boat or fishing trip can see availability and book or message you in a tap or two.',
      },
      {
        q: 'My season is only three months. Is a custom site worth it?',
        a: 'Yes, and the short season is the argument for it. The bookings for your summer are made in spring and winter, online, so a fast findable site works hardest in your off months capturing them. One good site earns across every season even when you are closed.',
      },
      {
        q: 'A lot of my customers come from out of state. Does that matter for the build?',
        a: 'It shapes it. Out-of-state visitors judge entirely on the site, with no local word of mouth to fall back on, and they are often on phones on the road. I build mobile-fast and make the trust signals and booking obvious, so a stranger planning a Rogue trip from three states away feels confident enough to book.',
      },
    ],
    neighbors: ['port-orford', 'bandon'],
    combos: ['app-development'],
  },
];

export const townBySlug = (slug: string): TownEntry | undefined =>
  towns.find((t) => t.slug === slug);

/** Towns that have dedicated combo pages for a given service slug. */
export const townsWithCombo = (serviceSlug: string): TownEntry[] =>
  towns.filter((t) => t.combos?.includes(serviceSlug));
