/**
 * The measured sites, in the one order every surface lists them.
 *
 * Client work first, newest client first. Preston's own properties last, and
 * winterscode.com only on the wall, never in the portfolio. The homepage wall,
 * the /wall page, the /work wall mapping and the recent-builds list all read
 * this list, so they cannot drift apart the way five hand-kept copies did
 * (S168, Preston's ruling).
 *
 * `key` is the field name in /api/workshop lighthouse and security.sites.
 * `published: false` hides a site everywhere until its own domain serves it.
 * `builtDays` is contract to live in business days and is only set where the
 * number was recorded; a site without one stays off the recent-builds list
 * rather than carry a guess.
 * Fallbacks are the last real reads, dated, used only when the API is down.
 */
export type SiteKey = 'taylor' | 'seabreeze' | 'bbtd' | 'golf' | 'sogn' | 'baseline' | 'winterscode';
export type Quad = [number, number, number, number];

export interface MeasuredSite {
  key: SiteKey;
  /** Short lowercase label on wall rows. */
  label: string;
  /** Full display name for the recent-builds list. */
  name: string;
  href: string;
  /** Slug of the /work card, when it has one. */
  portfolioSlug?: string;
  builtDays?: number;
  published: boolean;
  lhFallback?: Quad;
  secFallback?: { grade: string; score: number };
}

export const SITES: MeasuredSite[] = [
  {
    // Cutover pending (tracks/wc-taylor-cutover.md W9). Flip published there.
    key: 'taylor', label: 'ussurveysupply', name: 'US Survey Supply',
    href: 'https://ussurveysupply.com', portfolioSlug: 'us-survey-supply',
    published: false,
  },
  {
    key: 'seabreeze', label: 'seabreeze', name: 'SeaBreeze Landscape & Home Repair',
    href: 'https://seabreeze.llc', portfolioSlug: 'seabreeze', builtDays: 7,
    published: true, lhFallback: [98, 100, 100, 100], secFallback: { grade: 'A+', score: 115 },
  },
  {
    key: 'bbtd', label: 'bandon', name: 'Bandon By The Dunes Realtee',
    href: 'https://www.bandonbythedunesrealtee.net', portfolioSlug: 'bandon-by-the-dunes', builtDays: 18,
    published: true, lhFallback: [97, 100, 100, 100], secFallback: { grade: 'A+', score: 130 },
  },
  {
    // PSI 2026-09-05 after the contrast pass. Build duration not recorded.
    key: 'golf', label: 'professorsgolf', name: 'Professors Golf',
    href: 'https://professorsgolf.com', portfolioSlug: 'professors-golf',
    published: true, lhFallback: [100, 100, 100, 100], secFallback: { grade: 'A+', score: 140 },
  },
  {
    key: 'sogn', label: 'sogn', name: 'Sogn Contracting',
    href: 'https://www.sogncontracting.com', portfolioSlug: 'sogn-contracting', builtDays: 3,
    published: true, lhFallback: [99, 100, 100, 100], secFallback: { grade: 'A+', score: 115 },
  },
  {
    key: 'baseline', label: 'baseline', name: 'Baseline Marketing',
    href: 'https://www.baseline.marketing', portfolioSlug: 'baseline-marketing',
    published: true, lhFallback: [99, 100, 100, 100], secFallback: { grade: 'A+', score: 115 },
  },
  {
    key: 'winterscode', label: 'winterscode', name: 'Winters Code',
    href: 'https://winterscode.com',
    published: true, lhFallback: [94, 100, 100, 100], secFallback: { grade: 'A+', score: 115 },
  },
];

export const WALL_SITES = SITES.filter((s) => s.published);
export const RECENT_BUILDS = WALL_SITES.filter((s) => typeof s.builtDays === 'number');

export function fmtQuad(q: Quad | undefined): string {
  return q ? q.join('/') : '';
}
export function fmtGrade(g: { grade: string; score?: number | null } | undefined): string {
  if (!g || !g.grade) return '';
  return typeof g.score === 'number' ? `${g.grade} (${g.score})` : g.grade;
}
