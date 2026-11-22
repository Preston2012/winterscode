/**
 * Counts the copy says out loud, computed from the data that the Wall reads.
 *
 * Preston, 2026-11-22: "We don't build stale into our products. We build alive
 * and up to date." A number of sites written into a sentence goes wrong the
 * day a site launches; a number read from SITES moves with it. Anything that
 * counts sites, clients or build days pulls from here, never from a literal.
 */
import { SITES, WALL_SITES, type SiteKey, type MeasuredSite } from './sites';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** "eight", or "Eight" with cap, and digits past twenty. */
export function numberWord(n: number, cap = false): string {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** Preston's own properties on the Wall; everything else on it is client work. */
export const OWN_KEYS: SiteKey[] = ['baseline', 'winterscode'];

/** Live client sites: the Wall's published rows that are not Preston's own. */
export const CLIENT_SITES: MeasuredSite[] = WALL_SITES.filter((s) => !OWN_KEYS.includes(s.key));

export function site(key: SiteKey): MeasuredSite {
  const s = SITES.find((x) => x.key === key);
  if (!s) throw new Error(`counts.ts: no site with key ${key}`);
  return s;
}

/** Build time in business days, as the Wall's recent-builds list shows it. */
export function builtDays(key: SiteKey): number {
  const d = site(key).builtDays;
  if (typeof d !== 'number') throw new Error(`counts.ts: ${key} has no builtDays`);
  return d;
}

/** "13 business days", "1 business day": build time in digits. */
export function bizDays(key: SiteKey): string {
  const n = builtDays(key);
  return `${n} business day${n === 1 ? '' : 's'}`;
}

/** "three business days", "one business day": build time in words, for prose. */
export function bizDaysWord(key: SiteKey, cap = false): string {
  const n = builtDays(key);
  return `${numberWord(n, cap)} business day${n === 1 ? '' : 's'}`;
}

/** "three days", "one day": the short form a headline uses. */
export function daysWord(key: SiteKey, cap = false): string {
  const n = builtDays(key);
  return `${numberWord(n, cap)} day${n === 1 ? '' : 's'}`;
}

/**
 * The Home sites reel, in the order it was filmed (S339, 2026-11-21). A video
 * is a recording, so this list is what the film shows, and the door's words are
 * computed from it. When a new client site goes live and is not in the reel,
 * reelMissing names it, and the build prints it, so the reel gets recut rather
 * than quietly falling behind the Wall.
 */
// Preston 2026-11-22: the reel is the eight client sites; Baseline is out.
export const REEL_KEYS: SiteKey[] = ['grand', 'bbtd', 'makai', 'taylor', 'seabreeze', 'sogn', 'golf', 'jen'];
/** Sites in the reel whose phone menu opens on camera (South Coast Cuisine has none). */
export const REEL_MENU_KEYS: SiteKey[] = ['grand', 'makai', 'bbtd', 'sogn', 'taylor', 'seabreeze', 'golf'];
/** The reel's running time, read off the encoded master (47.8 s), rounded to the second. */
export const REEL_SECONDS = 48;
/** "0:48" for the door's play label. */
export const reelClock = `${Math.floor(REEL_SECONDS / 60)}:${String(REEL_SECONDS % 60).padStart(2, '0')}`;
export const REEL_SITES: MeasuredSite[] = REEL_KEYS.map(site);
export const reelMissing: MeasuredSite[] = CLIENT_SITES.filter((s) => !REEL_KEYS.includes(s.key));
if (reelMissing.length) {
  console.warn(`[counts] the sites reel predates ${reelMissing.map((s) => s.name).join(', ')}: recut it`);
}
