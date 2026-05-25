/**
 * Portfolio data, single source of truth for Apps + Sites sections.
 * Update here; both homepage grids and any future case-study routes
 * pick up the changes.
 *
 * Order field controls display sequence within each category (lower = first).
 *
 * S7+ update (2026-05-12): image field added. MyKonos merged into a
 * unified Demiurge + MyKonos card (engine + product told together).
 * Baseline gets two images (card hero + expand poster) per Preston's
 * spec, magazine-style cover vs spread.
 */

export type PortfolioCategory = 'site' | 'app';
export type PortfolioStatus = 'live' | 'beta' | 'planned';

export interface PortfolioImage {
  /** Primary card hero, wide aspect (~2:1). */
  src: string;
  /** Smaller variant for mobile thumbnails (720w). Optional. */
  srcSmall?: string;
  /** Smallest variant for phone-class displays (480w). Optional. */
  srcXSmall?: string;
  /** Secondary image shown in expanded card detail. Optional. */
  expand?: string;
  /** Alt text. */
  alt: string;
  /** Natural width/height for layout-shift prevention. */
  width: number;
  height: number;
}

export interface PortfolioItem {
  /** URL-safe slug. */
  slug: string;
  /** Roman numeral or letter for the work-num marker (i, ii, iii, ...). */
  numeral: string;
  /** Display name. */
  name: string;
  /** Category. */
  category: PortfolioCategory;
  /** One-line meta (domain · type · timeline). */
  meta: string;
  /** Stack chips. */
  tags: string[];
  /** Current status. */
  status: PortfolioStatus;
  /** Hero image for the card. */
  image?: PortfolioImage;
  /** Expanded detail rows (label/value pairs). */
  details: { label: string; value: string }[];
  /** Optional pull quote shown inside the expanded detail. */
  quote?: { text: string; attr: string };
  /** Links shown at the bottom of expanded detail. */
  links: { label: string; href: string; primary?: boolean }[];
  /** Display order within category, lower = first. */
  order: number;
}

export const portfolio: PortfolioItem[] = [
  // ─────────── SITES ───────────
  {
    slug: 'sogn-contracting',
    numeral: 'i.',
    name: 'Sogn Contracting',
    category: 'site',
    meta: 'sogncontracting.com · contractor · 3-day build',
    tags: ['NEXT.JS', 'VERCEL', 'TYPESCRIPT'],
    status: 'live',
    order: 10,
    image: {
      src: '/work/sogn-card.webp',
      srcSmall: '/work/sogn-card-720.webp',
      srcXSmall: '/work/sogn-card-480.webp',
      alt: 'Sogn Contracting Bandon Oregon: company logo with green and gold accents.',
      width: 1200,
      height: 630,
    },
    details: [
      {
        label: 'Stack',
        value: 'Next.js 14 · Vercel · TypeScript · edge functions',
      },
      {
        label: 'Scope',
        value:
          'Full marketing site for a 30-year contractor business. Before/after gallery, services pages, lead form. Built in 3 days from kickoff to live.',
      },
      {
        label: 'Result',
        value: 'Lighthouse 95+ average across all four categories. Live, indexed, and earning local search visibility.',
      },
    ],
    quote: {
      text: 'Built for Sogn Contracting.',
      attr: '30-year Oregon Professional Contractor · Live since 2026',
    },
    links: [
      { label: 'Visit site →', href: 'https://sogncontracting.com', primary: true },
    ],
  },
  {
    slug: 'baseline-marketing',
    numeral: 'ii.',
    name: 'Baseline Marketing',
    category: 'site',
    meta: 'baseline.marketing · 13 pages · 22 custom widgets',
    tags: ['NEXT.JS', 'TYPESCRIPT', 'CLOUDFLARE'],
    status: 'live',
    order: 20,
    details: [
      {
        label: 'Stack',
        value: 'Next.js 14 · TypeScript strict · Cloudflare Pages · zero UI dependencies',
      },
      {
        label: 'Scope',
        value:
          '13-page marketing + portfolio site for my own product, Baseline. 22 custom interactive widgets built from scratch (radar charts, timelines, signal gauges, heatmaps, constellation maps). No chart libraries, no Tailwind, no UI kits.',
      },
    ],
    links: [
      { label: 'Visit site →', href: 'https://baseline.marketing', primary: true },
      { label: '/built page', href: 'https://baseline.marketing/built' },
    ],
  },

  // ─────────── APPS ───────────
  {
    slug: 'baseline',
    numeral: 'iii.',
    name: 'Baseline',
    category: 'app',
    meta: 'Political intelligence · 106 figures · 28 screens · 4 AI models',
    tags: ['FLUTTER', 'SUPABASE', 'DEMIURGE'],
    status: 'beta',
    order: 30,
    image: {
      src: '/work/baseline-card.webp',
      srcSmall: '/work/baseline-card-720.webp',
      srcXSmall: '/work/baseline-card-480.webp',
      expand: '/work/baseline-poster.webp',
      alt: 'Baseline: bar chart of 106 tracked figures with consensus line, teal on deep navy.',
      width: 1280,
      height: 640,
    },
    details: [
      {
        label: 'Stack',
        value: 'Flutter · Supabase · 22 edge functions · 4 AI models in parallel',
      },
      {
        label: 'Scope',
        value:
          'Multi-AI political speech analysis. 106 tracked figures. Claude, GPT, and Grok analyze each statement independently. When they disagree, that disagreement is the signal.',
      },
      {
        label: 'Status',
        value: 'Built · in private beta · public marketing at baseline.marketing',
      },
    ],
    links: [
      { label: 'View site →', href: 'https://baseline.marketing', primary: true },
    ],
  },
  {
    slug: 'stainslayer-ai',
    numeral: 'ii.',
    name: 'StainSlayer AI',
    category: 'app',
    meta: 'AI stain ID · 4 modes · live on App Store + Play Store',
    tags: ['FLUTTER', 'VISION', 'IN-APP PURCHASES'],
    status: 'live',
    order: 20,
    image: {
      src: '/work/stainslayer-card.webp',
      srcSmall: '/work/stainslayer-card-720.webp',
      srcXSmall: '/work/stainslayer-card-480.webp',
      alt: 'StainSlayer AI: rainbow stain splash with script tagline "Stain Removal, Instantly."',
      width: 1280,
      height: 625,
    },
    details: [
      {
        label: 'Stack',
        value: 'Flutter · OpenAI vision · in-app purchases · iOS + Android',
      },
      {
        label: 'Scope',
        value:
          'Snap a stain, get step-by-step removal. Four modes: Normal, Eco (non-toxic), Emergency (time-sensitive), Fun. Subscription tiers and pay-per-use credits. Photos processed instantly and never stored.',
      },
      {
        label: 'Status',
        value: 'Live on App Store and Google Play.',
      },
    ],
    links: [
      {
        label: 'App Store →',
        href: 'https://apps.apple.com/us/app/stainslayer-ai/id6757208835',
        primary: true,
      },
      {
        label: 'Play Store →',
        href: 'https://play.google.com/store/apps/details?id=com.mycompany.stainslayerai',
      },
    ],
  },
  {
    slug: 'choplight',
    numeral: 'iv.',
    name: 'ChopLight',
    category: 'app',
    meta: 'Motion-activated flashlight · gesture detection · subscription tier',
    tags: ['FLUTTER', 'SENSORS', 'IN-APP PURCHASES'],
    status: 'beta',
    order: 40,
    image: {
      src: '/work/choplight-card.webp',
      srcSmall: '/work/choplight-card-720.webp',
      srcXSmall: '/work/choplight-card-480.webp',
      alt: 'ChopLight app in active state: amber-glowing circle on black with a small flashlight icon centered, "Tap to toggle" prompt below, green dot indicating motion detection is running, "Stop Detection" button.',
      width: 1280,
      height: 640,
    },
    details: [
      {
        label: 'Stack',
        value: 'Flutter · accelerometer + gyroscope · native flashlight API · in-app purchases',
      },
      {
        label: 'Scope',
        value:
          'Flashlight that turns on with a chop gesture, no button tap. For anyone with their hands full: parents carrying kids, contractors on a job, dog walkers at night. Calibration, sensitivity tuning, pocket lock, battery guard, SOS pattern. Subscription tier shipped. Zero analytics.',
      },
      {
        label: 'Status',
        value: 'Private beta · feedback iteration before store submission.',
      },
    ],
    links: [],
  },
  {
    slug: 'demiurge-mykonos',
    numeral: 'i.',
    name: 'Demiurge + MyKonos',
    category: 'app',
    meta: 'Memory engine · powering the MyKonos AI companion',
    tags: ['DEMIURGE', 'FLUTTER', 'CLAUDE'],
    status: 'beta',
    order: 10,
    image: {
      src: '/work/demiurge-card.webp',
      srcSmall: '/work/demiurge-card-720.webp',
      srcXSmall: '/work/demiurge-card-480.webp',
      alt: 'Project Demiurge: isometric hexagonal node graph in teal, one node lit orange, dark editorial poster.',
      width: 1280,
      height: 640,
    },
    details: [
      {
        label: 'Stack',
        value: 'Demiurge memory engine (custom, 2,500+ memories and growing) · Flutter app · BYOK Anthropic',
      },
      {
        label: 'Scope',
        value:
          'I built the engine and the product that runs on it. Demiurge is a persistent-memory layer for LLM conversations. MyKonos is the AI companion that uses it: bring your own keys, talk to it, and the memory compresses into a long-term store you actually own.',
      },
      {
        label: 'Status',
        value: 'Demiurge live · MyKonos in private beta on real phones · backend stable',
      },
    ],
    links: [],
  },
];

export const sites = portfolio
  .filter((p) => p.category === 'site')
  .sort((a, b) => a.order - b.order);

export const apps = portfolio
  .filter((p) => p.category === 'app')
  .sort((a, b) => a.order - b.order);
