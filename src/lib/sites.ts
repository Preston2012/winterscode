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
 * `builtDays` is BUILD TIME in business days, from Preston: the days spent
 * building once the client had handed over what the build needed. It is NOT
 * contract to live. Corrected 2026-09-11 (S230) because the public caption said
 * contract to live and that was false for every site on this list. Waiting on a
 * client for photos, copy or access is not build time and was never counted; a
 * site
 * without one stays off the recent-builds list rather than carry a guess.
 * Fallbacks are the last real reads, dated, used only when the API is down.
 * Refreshed 2026-10-22 (S339) from /api/workshop: PSI mobile median, Observatory live.
 */
export type SiteKey = 'grand' | 'makai' | 'jen' | 'taylor' | 'seabreeze' | 'bbtd' | 'golf' | 'sogn' | 'baseline' | 'winterscode';
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
    // S339, 2026-10-28: newest client, live on www since 2026-10-27 (the apex
    // 301s to www, so www is the measured host). Fallbacks measured
    // 2026-10-28: Lighthouse lab run on the homepage (98, 100, 100, 100) and
    // a direct Observatory scan (A+, 125). No builtDays until Preston gives
    // the build time, so Grand stays off the recent-builds list until then.
    key: 'grand', label: 'grandmgmt', name: 'Grand Management Services',
    href: 'https://www.grandmgmt.com', portfolioSlug: 'grand-management',
    published: true, lhFallback: [98, 100, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
  {
    // S339: newest client, live on www since 2026-10-19 (the apex 301s to www,
    // so www is the measured host, as with Sogn and Bandon). Fallbacks measured
    // 2026-10-22: Lighthouse mobile lab run on the homepage (the playbook's
    // lighthouse-run, not PSI) and a direct Observatory scan. builtDays 5, per
    // Preston 2026-10-22: signed Tue 10-13, live on her go email Mon 10-19.
    key: 'makai', label: 'makaipainting', name: 'Makai Painting',
    href: 'https://www.makaipainting.com', portfolioSlug: 'makai-painting', builtDays: 5,
    published: true, lhFallback: [93, 100, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
  {
    // S339: South Coast Cuisine, live since 2026-09-22 on the apex (www 301s
    // to it). Fallbacks measured 2026-10-22: Lighthouse lab run and a direct
    // Observatory scan. builtDays 3, per Preston 2026-10-22: about two days,
    // three with the client editor; the larger figure is the one shown.
    key: 'jen', label: 'southcoastcuisine', name: 'South Coast Cuisine',
    href: 'https://southcoastcuisine.net', portfolioSlug: 'south-coast-cuisine', builtDays: 3,
    published: true, lhFallback: [97, 100, 100, 100], secFallback: { grade: 'A+', score: 140 },
  },
  {
    // Cutover done 2026-09-11 (S230): the apex serves this build.
    key: 'taylor', label: 'ussurveysupply', name: 'US Survey Supply',
    href: 'https://ussurveysupply.com', portfolioSlug: 'us-survey-supply', builtDays: 8,
    published: true,
    // Both measured against the live apex on 2026-09-11, the day of the
    // cutover. Lighthouse is PSI mobile with the project key; Observatory is a
    // direct scan. Neither is copied from the staging host or from an older
    // record. The worker also measures this site live now, so these stand in
    // only when the API is down.
    lhFallback: [97, 100, 100, 100],
    secFallback: { grade: 'A+', score: 135 },
  },
  {
    key: 'seabreeze', label: 'seabreeze', name: 'SeaBreeze Landscape Care and Home Repair',
    href: 'https://seabreeze.llc', portfolioSlug: 'seabreeze', builtDays: 7,
    published: true, lhFallback: [95, 100, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
  {
    key: 'bbtd', label: 'bandon', name: 'Bandon By The Dunes Realtee',
    href: 'https://www.bandonbythedunesrealtee.net', portfolioSlug: 'bandon-by-the-dunes', builtDays: 18,
    published: true, lhFallback: [93, 100, 100, 100], secFallback: { grade: 'A+', score: 135 },
  },
  {
    // PSI 2026-09-05 after the contrast pass. One business day, per Preston.
    key: 'golf', label: 'professorsgolf', name: 'Professors Golf',
    href: 'https://professorsgolf.com', portfolioSlug: 'professors-golf', builtDays: 1,
    published: true, lhFallback: [100, 100, 100, 100], secFallback: { grade: 'A+', score: 140 },
  },
  {
    key: 'sogn', label: 'sogn', name: 'Sogn Contracting',
    href: 'https://www.sogncontracting.com', portfolioSlug: 'sogn-contracting', builtDays: 3,
    published: true, lhFallback: [96, 100, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
  {
    key: 'baseline', label: 'baseline', name: 'Baseline Marketing',
    href: 'https://www.baseline.marketing', portfolioSlug: 'baseline-marketing',
    published: true, lhFallback: [95, 100, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
  {
    key: 'winterscode', label: 'winterscode', name: 'Winters Code',
    href: 'https://winterscode.com',
    published: true, lhFallback: [96, 97, 100, 100], secFallback: { grade: 'A+', score: 125 },
  },
];

export const WALL_SITES = SITES.filter((s) => s.published);
export const RECENT_BUILDS = WALL_SITES.filter((s) => typeof s.builtDays === 'number');

export function fmtQuad(q: Quad | undefined): string {
  // An unsampled site is pending, not empty. A bare label with nothing after it
  // reads as a rendering fault; the mark says the row is real and the number is
  // not in yet.
  return q ? q.join('/') : '\u00b7';
}
export function fmtGrade(g: { grade: string; score?: number | null } | undefined): string {
  if (!g || !g.grade) return '';
  return typeof g.score === 'number' ? `${g.grade} (${g.score})` : g.grade;
}
