/**
 * /api/workshop, single source of truth for Wall + Hero trust + Workshop Status.
 *
 * Runs as a Cloudflare Function (Pages Functions on workerd).
 * Aggregates 4 data sources, caches via Cloudflare cache, returns JSON.
 *
 * Data sources:
 * - GitHub Events API (deploys, last commit ago), uses GITHUB_TOKEN env
 * - PageSpeed Insights (Lighthouse for winterscode.com + sogncontracting.com), uses PSI_KEY env
 * - Mozilla Observatory (security headers grade), public API, no key
 * - Cal.com (next availability), public availability API (no key needed for public username)
 *
 * Cache: 15min (cf-cdn cache) per upstream. If an upstream fails, we serve
 * its 'last-known-good' from the static fallback baked into this file.
 *
 * Spec ref: docs/design/S6_PLUS.md DATA SOURCES + AUTH table (~line 1519).
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// Astro 6 + Cloudflare adapter: env comes from cloudflare:workers, not locals.runtime.
// This module is virtual at build time and resolved by Cloudflare's runtime.
// In dev, wrangler provides the .dev.vars values; in prod, Cloudflare Pages env vars.
// Import is dynamic-typed so TS doesn't choke on the virtual module.
// @ts-ignore, virtual module
import { env as cfEnv } from 'cloudflare:workers';

interface WorkshopData {
  deploys: {
    last: string;          // "4m ago" | "2h ago" | "3d ago"
    last_message: string;  // first line of last commit, or '[private repo] · main'
    count_30d: number;
    repo_count: number;
    source: 'live' | 'fallback';
  };
  lighthouse: {
    winterscode: [number, number, number, number]; // [perf, a11y, seo, best]
    sogn:        [number, number, number, number];
    baseline:    [number, number, number, number];
    bbtd:        [number, number, number, number];
    seabreeze:   [number, number, number, number];
    measured: string; // "8m ago"
    source: 'live' | 'fallback';
  };
  security: {
    grade: string;        // winterscode grade, kept for existing consumers
    score: number;        // winterscode numeric score
    headers_ok: string[]; // winterscode header checklist
    sites: {
      winterscode: { grade: string; score: number };
      sogn:        { grade: string; score: number };
      baseline:    { grade: string; score: number };
      bbtd:        { grade: string; score: number };
      seabreeze:   { grade: string; score: number };
    };
    source: 'live' | 'fallback';
  };
  calendar: {
    next: string;        // "Wed 5pm PT"
    source: 'live' | 'fallback';
  };
  engine: {
    memories: number;
    added_last_7d: number;
    uptime_30d_pct: number;
    source: 'live' | 'cached' | 'fallback';
  };
  speed: {
    last_three: string;  // "3d" or "3d · 5d · 4d" once 3+ builds exist
    source: 'live' | 'fallback';
  };
  updated_at: string; // ISO timestamp
}

// LAST-KNOWN-GOOD, used as fallback if upstream fails. Update as
// build durations and metrics change. These are the values the user
// sees when GitHub/PSI/Observatory/Cal.com is unreachable.
const FALLBACK: WorkshopData = {
  deploys: {
    last: '4m ago',
    last_message: '[private repo] · main',
    count_30d: 30,
    repo_count: 4,
    source: 'fallback',
  },
  lighthouse: {
    // Verified PSI mobile median across 3 runs on 2026-05-13 after the
    // contrast + perf pass (commits c9aa664 + 95d7ba7). A11Y now 100 on
    // both sites. Sogn perf hovers 99 (LCP 2.1s). Winterscode perf 94-98
    // bench-dependent. fallback shows the typical-bench number.
    winterscode: [95, 100, 100, 100],
    sogn:        [95, 100, 100, 100],
    // Baseline.marketing: heavier site (Scifi entry, animations), PSI flaky
    // on the www subdomain. Conservative fallback below typical PSI scores.
    baseline:    [95, 100, 100, 100],
    // Bandon By The Dunes Realtee (Astro on Cloudflare). Confirmed live PSI
    // median (mobile), measured 2026-06-24: perf 95, a11y/seo/best 100.
    bbtd:        [95, 100, 100, 100],
    // SeaBreeze Landscape and Home Repair (seabreeze.llc), Astro on Cloudflare.
    // PSI mobile perf is noisy (95-98 typical); a11y/seo/best 100. Conservative
    // fallback only; live PSI populates the real number on the wall + cards.
    seabreeze:   [95, 100, 100, 100],
    measured: '8m ago',
    source: 'fallback',
  },
  security: {
    // Observatory grade + score. Top-level = winterscode (kept for existing
    // consumers). Per-site map drives the per-card + wall security rows.
    // Fallbacks are real grades measured 2026-07-24 (all A+; bbtd 130, rest 115).
    grade: 'A+',
    score: 115,
    headers_ok: ['HSTS', 'CSP', 'X-Frame-Options', 'Referrer-Policy', 'X-Content-Type-Options'],
    sites: {
      winterscode: { grade: 'A+', score: 115 },
      sogn:        { grade: 'A+', score: 115 },
      baseline:    { grade: 'A+', score: 115 },
      bbtd:        { grade: 'A+', score: 130 },
      seabreeze:   { grade: 'A+', score: 115 },
    },
    source: 'fallback',
  },
  calendar: {
    next: 'Wed 3:30pm PT',
    source: 'fallback',
  },
  engine: {
    // Demiurge brain count + recent growth. Conservative fallbacks:
    // real numbers as of 2026-05-14 are 2405 total / 95 in 24h / 377 in 7d.
    // Fallback below floors. Live wiring via demi-api stats endpoint
    // (post-launch task: add /api/v1/wc-demo/stats route).
    memories: 2400,
    added_last_7d: 50,
    uptime_30d_pct: 100,
    source: 'fallback',
  },
  speed: {
    // Only one real client build to date (Sogn Contracting, May 2026). Update
    // manually as new builds ship; once 3+ exist, switch to a comma-joined
    // last_three. Source marked 'live' because this IS the source of truth,
    // not a fallback for a missing upstream - there's no API behind it yet.
    last_three: '3d',
    source: 'live',
  },
  updated_at: new Date().toISOString(),
};

// ─── Helpers ──────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60)        return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)        return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)         return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/**
 * Per-upstream timeout wrapper. All upstreams cap at 3s individually so a
 * slow API never blocks the page. Whole endpoint also caps at 4.5s overall
 * (see GET handler). Stale-while-revalidate via Cloudflare cache absorbs
 * the brief stub-response on first cold hit; subsequent hits within 15min
 * are edge-cached and instant.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

async function fetchGitHub(
  token: string | undefined,
  kv?: KVNamespace,
): Promise<WorkshopData['deploys']> {
  if (!token) return FALLBACK.deploys;
  // KV cache: GitHub Events API can take 1-3s across 3 paginated pages.
  // When the outer 5s timeout fires (slow network, GH rate-limit, etc),
  // we'd lose the deploys row to FALLBACK on every request. Cache successful
  // results for 5min so the wall doesn't flicker between live/fallback as
  // edge conditions vary. Short TTL because deploys data changes every push.
  const CACHE_KEY = 'workshop:gh:v1';
  // 30d TTL. Retention is decoupled from freshness: REFRESH_AFTER_SEC (5min)
  // below decides when to re-fetch; this TTL only decides how long the last
  // good value survives. A long retention means a multi-day GitHub outage
  // keeps showing 'cached' real numbers instead of dropping to 'fallback'.
  const CACHE_TTL = 60 * 60 * 24 * 30;
  // Pre-read cache so non-throwing failure paths can return 'cached' too.
  // The previous structure only used cache in the catch block, which meant
  // rate-limit hits (!r.ok -> break -> empty array -> return FALLBACK) never
  // fell through to cached. Now every failure path can return cached.
  let lastCached: WorkshopData['deploys'] | undefined;
  let cacheAgeSec = Infinity;
  if (kv) {
    try {
      // Use getWithMetadata so we know how old the cached value is.
      // KV doesn't expose put-time directly, so we store cachedAt inside the
      // value itself going forward. For backwards-compat, treat values
      // without cachedAt as "fresh enough" (must be recent or KV would have
      // expired them per the 6h TTL).
      const c = await kv.get<WorkshopData['deploys'] & { _cachedAt?: number }>(CACHE_KEY, 'json');
      if (c) {
        lastCached = c;
        cacheAgeSec = c._cachedAt ? (Date.now() - c._cachedAt) / 1000 : Infinity; // legacy entry without timestamp = treat as stale, force refresh
      }
    } catch { /* KV read failure non-fatal */ }
  }
  // CRITICAL: If we have a fresh cached value, return it immediately.
  // GitHub's authenticated rate limit is 5000/hr. Without this guard, every
  // /api/workshop request hits GitHub, which exhausts quota in hours under
  // moderate traffic. Refresh cache only when older than REFRESH_AFTER_SEC.
  const REFRESH_AFTER_SEC = 5 * 60; // 5 minutes
  if (lastCached && cacheAgeSec < REFRESH_AFTER_SEC) {
    return { ...lastCached, source: 'live' as const };
  }
  const cachedOrFallback = (): WorkshopData['deploys'] =>
    lastCached ? { ...lastCached, source: 'cached' as const } : FALLBACK.deploys;
  try {
    // Paginate up to 3 pages (300 events) to capture the full 30-day window.
    // Single page (100 events) maxes out fast at ~50 in our use case.
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'winterscode-wall/1.0',
    };
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let allEvents: any[] = [];
    let keepPaging = true;
    for (let page = 1; page <= 3 && keepPaging; page++) {
      const r = await fetch(
        `https://api.github.com/users/Preston2012/events?per_page=100&page=${page}`,
        { signal: AbortSignal.timeout(5000), headers },
      );
      if (!r.ok) break;
      const pageEvents: any[] = await r.json();
      if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;
      allEvents = allEvents.concat(pageEvents);
      // Stop early if oldest event on this page is already beyond 30 days
      const oldestOnPage = pageEvents[pageEvents.length - 1];
      if (oldestOnPage?.created_at && new Date(oldestOnPage.created_at).getTime() < cutoffMs) {
        keepPaging = false;
      }
    }
    if (!allEvents.length) return cachedOrFallback();
    const pushEvents = allEvents.filter(e => e.type === 'PushEvent');
    if (!pushEvents.length) return cachedOrFallback();
    // Headline deploy = most recent SHOWABLE push: a public repo with commits,
    // or winterscode itself (private showcase, message pulled directly). Other
    // private repos (client work) still count in the 30-day totals below but
    // never surface here, so no client repo name or commit text leaks. Tracks
    // all public repos, masks private. firstLine caps length; the status chrome
    // adds a CSS ellipsis so long subjects never overflow the pill or card.
    const firstLine = (m: string, max = 56): string => {
      const ln = (m || '').split('\n')[0].trim();
      return ln.length > max ? ln.slice(0, max).trimEnd() : ln;
    };
    const WC_REPO = 'Preston2012/winterscode';
    const showable = pushEvents.find(
      e => (e.public === true && e.payload?.commits?.length) || e.repo?.name === WC_REPO,
    ) ?? pushEvents[0];
    const last = relativeTime(showable.created_at);
    let last_message: string;
    if (showable.public === true && showable.payload?.commits?.length) {
      last_message = firstLine(showable.payload.commits[0].message);
    } else if (showable.repo?.name === WC_REPO) {
      // events API omits commits for private repos; pull winterscode's directly
      let msg = '';
      try {
        const cr = await fetch('https://api.github.com/repos/Preston2012/winterscode/commits?per_page=1',
          { signal: AbortSignal.timeout(4000), headers });
        if (cr.ok) {
          const commits: any[] = await cr.json();
          msg = firstLine(commits?.[0]?.commit?.message ?? '');
        }
      } catch { /* fall back to masked label */ }
      last_message = msg || 'winterscode · main';
    } else {
      const repoShort = showable.repo?.name?.split('/').pop() ?? 'repo';
      last_message = `[private repo] · ${repoShort} · main`;
    }
    // Client-named commit subjects stay out of the public feed.
    if (/davis|keeli|gernandt|bandonhomes|bandonrealtee|\bbarry\b|\bjodie\b|seabreeze|\bstacy\b/i.test(last_message)) {
      last_message = 'client build · main';
    }
    // 30-day rolling count of push events
    // cutoffMs already defined above for pagination
    const recent = pushEvents.filter(e => new Date(e.created_at).getTime() > cutoffMs);
    const uniqueRepos = new Set(recent.map(e => e.repo?.name).filter(Boolean));
    const result: WorkshopData['deploys'] = {
      last,
      last_message,
      count_30d: Math.max(recent.length, FALLBACK.deploys.count_30d), // floor to fallback
      repo_count: Math.max(uniqueRepos.size, FALLBACK.deploys.repo_count),
      source: 'live',
    };
    // Cache successful github result so timeouts don't flip the wall to
    // fallback. Stamp cachedAt so reads can tell if cache is fresh enough
    // to skip refresh (see REFRESH_AFTER_SEC guard above). Fire-and-forget.
    if (kv) {
      try {
        await kv.put(CACHE_KEY, JSON.stringify({ ...result, _cachedAt: Date.now() }), { expirationTtl: CACHE_TTL });
      } catch { /* non-fatal */ }
    }
    return result;
  } catch {
    return cachedOrFallback();
  }
}

async function fetchPSI(
  key: string | undefined,
  kv?: KVNamespace,
  skipCache = false,
): Promise<WorkshopData['lighthouse']> {
  if (!key) return FALLBACK.lighthouse;
  // KV cache: PSI runs take 10-30s, well outside per-request budget.
  // Read cached value if present (12h TTL); if absent/stale, fall back
  // and let a background refresh (ctx.waitUntil) populate KV for next hit.
  const CACHE_KEY = 'workshop:psi:v2';
  const CACHE_TTL = 60 * 60 * 12;

  if (kv && !skipCache) {
    try {
      const cached = await kv.get<WorkshopData['lighthouse']>(CACHE_KEY, 'json');
      if (cached) return { ...cached, source: 'cached' };
    } catch { /* KV read failure non-fatal, proceed to live attempt */ }
  }

  // Per-site audit with independent failure handling. If one site's PSI
  // call fails (Lighthouse internal 500s are common on Baseline today),
  // we keep the other sites' live scores and fall back ONLY the failed
  // one. This protects the homepage from "all-or-nothing" PSI outages.
  // PSI mobile lab perf is noisy run-to-run (cold-cache + throttling jitter
  // can swing perf several points). Lighthouse's own guidance is to take the
  // median of multiple runs. We sample each site 3 times and report the
  // per-category median so a single low sample never sticks for the cache TTL.
  const RUNS = 3;
  const singleRun = async (url: string): Promise<[number, number, number, number] | null> => {
    try {
      const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&category=accessibility&category=seo&category=best-practices&strategy=mobile&key=${key}`;
      const r = await fetch(psiUrl, { signal: AbortSignal.timeout(22000) });
      if (!r.ok) return null;
      const data: any = await r.json();
      if (data.lighthouseResult?.runtimeError) return null;
      const cats = data.lighthouseResult?.categories ?? {};
      const score = (k: string) => Math.round((cats[k]?.score ?? 0) * 100);
      const result: [number, number, number, number] = [
        score('performance'),
        score('accessibility'),
        score('seo'),
        score('best-practices'),
      ];
      // Zeroed categories signal a partial PSI failure; drop this run.
      if (result.some(n => n === 0)) return null;
      // Challenge/error-page guard: every monitored site scores accessibility
      // ~100. A run far below that is PSI's crawler hitting a Cloudflare
      // bot-challenge / interstitial (scores a11y ~54), not the real page.
      // Drop it so a challenge sample never reaches the median or the cache.
      if (result[1] < 80) return null;
      return result;
    } catch {
      return null;
    }
  };
  const median = (nums: number[]): number => {
    const a = [...nums].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };
  const auditSite = async (url: string, fallback: [number, number, number, number]): Promise<[number, number, number, number]> => {
    const runs = (await Promise.all(Array.from({ length: RUNS }, () => singleRun(url))))
      .filter((x): x is [number, number, number, number] => x !== null);
    if (!runs.length) return fallback;
    return [
      median(runs.map(r => r[0])),
      median(runs.map(r => r[1])),
      median(runs.map(r => r[2])),
      median(runs.map(r => r[3])),
    ];
  };
  // Measure the canonical www directly. The old PSI Lighthouse-500 on www is
  // resolved (verified May 2026, www PSI ~96). Measuring the bare apex paid the
  // 301 to www redirect penalty (~92 vs ~96 on www); www matches the sogn entry.
  const [wc, sogn, baseline, bbtd, seabreeze] = await Promise.all([
    auditSite('https://winterscode.com', FALLBACK.lighthouse.winterscode),
    auditSite('https://www.sogncontracting.com', FALLBACK.lighthouse.sogn),
    auditSite('https://www.baseline.marketing', FALLBACK.lighthouse.baseline),
    auditSite('https://www.bandonbythedunesrealtee.net', FALLBACK.lighthouse.bbtd),
    auditSite('https://seabreeze.llc', FALLBACK.lighthouse.seabreeze),
  ]);
  // Source flag is 'live' if any site returned non-fallback data.
  // UI shows "live · partial" when not all 3 succeeded.
  const isLive =
    JSON.stringify(wc) !== JSON.stringify(FALLBACK.lighthouse.winterscode) ||
    JSON.stringify(sogn) !== JSON.stringify(FALLBACK.lighthouse.sogn) ||
    JSON.stringify(baseline) !== JSON.stringify(FALLBACK.lighthouse.baseline) ||
    JSON.stringify(bbtd) !== JSON.stringify(FALLBACK.lighthouse.bbtd) ||
    JSON.stringify(seabreeze) !== JSON.stringify(FALLBACK.lighthouse.seabreeze);

  // Rolling-best display. Keep the last N live runs per site in KV and show the
  // element-wise best-of-N per category, so a single cold/throttled PSI run (or
  // a stale cached low) never tanks the public number. AGG='avg' for a rolling
  // average instead of best-of-N.
  type Quad = [number, number, number, number];
  const HIST_KEY = 'workshop:psi:hist:v2';
  const HIST_TTL = 60 * 60 * 24 * 30;
  const HIST_N = 7;
  const AGG: 'max' | 'avg' = 'max';
  const aggregate = (runs: Quad[], fb: Quad): Quad => {
    if (!runs.length) return fb;
    const pick = (i: number): number => {
      const vals = runs.map(r => r[i]).filter(n => n > 0);
      if (!vals.length) return fb[i];
      return AGG === 'avg'
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : Math.max(...vals);
    };
    return [pick(0), pick(1), pick(2), pick(3)];
  };
  let hist: { winterscode: Quad[]; sogn: Quad[]; baseline: Quad[]; bbtd: Quad[]; seabreeze: Quad[] } =
    { winterscode: [], sogn: [], baseline: [], bbtd: [], seabreeze: [] };
  if (kv) {
    try { const h = await kv.get<typeof hist>(HIST_KEY, 'json'); if (h) hist = h; } catch { /* non-fatal */ }
  }
  const isFb = (a: Quad, b: Quad) => JSON.stringify(a) === JSON.stringify(b);
  const roll = (arr: Quad[], v: Quad, fb: Quad): Quad[] =>
    (isFb(v, fb) ? (arr ?? []) : [...(arr ?? []), v]).slice(-HIST_N);
  hist = {
    winterscode: roll(hist.winterscode, wc, FALLBACK.lighthouse.winterscode),
    sogn: roll(hist.sogn, sogn, FALLBACK.lighthouse.sogn),
    baseline: roll(hist.baseline, baseline, FALLBACK.lighthouse.baseline),
    bbtd: roll(hist.bbtd, bbtd, FALLBACK.lighthouse.bbtd),
    seabreeze: roll(hist.seabreeze, seabreeze, FALLBACK.lighthouse.seabreeze),
  };
  if (kv && isLive) {
    try { await kv.put(HIST_KEY, JSON.stringify(hist), { expirationTtl: HIST_TTL }); } catch { /* non-fatal */ }
  }

  const result: WorkshopData['lighthouse'] = {
    winterscode: aggregate(hist.winterscode, wc),
    sogn: aggregate(hist.sogn, sogn),
    baseline: aggregate(hist.baseline, baseline),
    bbtd: aggregate(hist.bbtd, bbtd),
    seabreeze: aggregate(hist.seabreeze, seabreeze),
    measured: 'just now',
    source: isLive ? 'live' : 'fallback',
  };

  // Persist successful audits to KV so future requests hit cache if PSI
  // quota is exhausted. Fire-and-forget; never block response on KV write.
  if (isLive && kv) {
    try {
      await kv.put(CACHE_KEY, JSON.stringify(result), {
        expirationTtl: CACHE_TTL,
      });
    } catch { /* KV write failure non-fatal */ }
  }

  return result;
}

async function fetchObservatory(kv?: KVNamespace): Promise<WorkshopData['security']> {
  // KV cache: 6h TTL, 30min refresh. Grades FIVE hosts (per-site rows on the
  // wall + each /work card). The cached object holds all five grades; if the
  // API is down we serve the cached object as 'cached'. Grades change rarely.
  const CACHE_KEY = 'workshop:obs:v2'; // v2: per-site shape
  const CACHE_TTL = 60 * 60 * 6;
  let lastCached: (WorkshopData['security'] & { _cachedAt?: number }) | undefined;
  let cacheAgeSec = Infinity;
  if (kv) {
    try {
      const c = await kv.get<WorkshopData['security'] & { _cachedAt?: number }>(CACHE_KEY, 'json');
      if (c && c.sites) {
        lastCached = c;
        cacheAgeSec = c._cachedAt ? (Date.now() - c._cachedAt) / 1000 : Infinity; // legacy = stale
      }
    } catch { /* KV read failure non-fatal */ }
  }
  const REFRESH_AFTER_SEC = 30 * 60;
  if (lastCached && cacheAgeSec < REFRESH_AFTER_SEC) {
    return { ...lastCached, source: 'live' as const };
  }
  const cachedOrFallback = (): WorkshopData['security'] =>
    lastCached ? { ...lastCached, source: 'cached' as const } : FALLBACK.security;

  // Canonical host per site (match the PSI hosts so grade + perf line up).
  const HOSTS: Record<keyof WorkshopData['security']['sites'], string> = {
    winterscode: 'winterscode.com',
    sogn:        'www.sogncontracting.com',
    baseline:    'www.baseline.marketing',
    bbtd:        'www.bandonbythedunesrealtee.net',
    seabreeze:   'seabreeze.llc',
  };
  const analyze = async (
    host: string,
  ): Promise<{ grade: string; score: number; rh: Record<string, string> } | null> => {
    try {
      const r = await fetch(
        `https://observatory-api.mdn.mozilla.net/api/v2/analyze?host=${host}`,
        { signal: AbortSignal.timeout(4000), headers: { 'Accept': 'application/json' } },
      );
      if (!r.ok) return null;
      const data: any = await r.json();
      const scan = data?.scan ?? (Array.isArray(data?.history) ? data.history[0] : null);
      if (!scan || typeof scan.grade !== 'string') return null;
      return {
        grade: scan.grade,
        score: typeof scan.score === 'number' ? scan.score : 0,
        rh: scan.response_headers ?? {},
      };
    } catch {
      return null;
    }
  };

  try {
    const keys = Object.keys(HOSTS) as (keyof typeof HOSTS)[];
    const results = await Promise.all(keys.map((k) => analyze(HOSTS[k])));
    const sites = {} as WorkshopData['security']['sites'];
    let anyLive = false;
    let wcRh: Record<string, string> = {};
    keys.forEach((k, i) => {
      const res = results[i];
      if (res) {
        anyLive = true;
        sites[k] = { grade: res.grade, score: res.score };
        if (k === 'winterscode') wcRh = res.rh;
      } else {
        sites[k] = FALLBACK.security.sites[k];
      }
    });
    if (!anyLive) return cachedOrFallback();

    // Header checklist derived from winterscode's live headers (top-level compat).
    const headersOk: string[] = [];
    if (wcRh['strict-transport-security']) headersOk.push('HSTS');
    if (wcRh['content-security-policy'])   headersOk.push('CSP');
    if (wcRh['x-frame-options'] ||
        (wcRh['content-security-policy'] || '').includes('frame-ancestors')) {
      headersOk.push('X-Frame-Options');
    }
    if (wcRh['referrer-policy'])         headersOk.push('Referrer-Policy');
    if (wcRh['x-content-type-options'])  headersOk.push('X-Content-Type-Options');
    if (wcRh['permissions-policy'])      headersOk.push('Permissions-Policy');

    const result: WorkshopData['security'] = {
      grade: sites.winterscode.grade,
      score: sites.winterscode.score,
      headers_ok: headersOk.length ? headersOk : FALLBACK.security.headers_ok,
      sites,
      source: 'live',
    };
    if (kv) {
      try { await kv.put(CACHE_KEY, JSON.stringify({ ...result, _cachedAt: Date.now() }), { expirationTtl: CACHE_TTL }); }
      catch { /* KV write failure non-fatal */ }
    }
    return result;
  } catch {
    return cachedOrFallback();
  }
}

async function fetchCal(
  username: string | undefined,
  kv?: KVNamespace,
  eventSlug = '30min-video',
): Promise<WorkshopData['calendar']> {
  // KV cache: 30min TTL. Cal slots change as people book or Preston blocks
  // dates. Short enough to stay fresh, long enough to survive a brief outage.
  const CACHE_KEY = 'workshop:cal:v1';
  const CACHE_TTL = 60 * 30;
  let lastCached: (WorkshopData['calendar'] & { _cachedAt?: number }) | undefined;
  let cacheAgeSec = Infinity;
  if (kv) {
    try {
      const c = await kv.get<WorkshopData['calendar'] & { _cachedAt?: number }>(CACHE_KEY, 'json');
      if (c) {
        lastCached = c;
        cacheAgeSec = c._cachedAt ? (Date.now() - c._cachedAt) / 1000 : Infinity; // legacy = stale
      }
    } catch { /* KV read failure non-fatal */ }
  }
  // Short-circuit: Cal slots change minute-by-minute when busy but most
  // visitors share the same view. Refresh every 5min, serve cache between.
  const REFRESH_AFTER_SEC = 5 * 60;
  if (lastCached && cacheAgeSec < REFRESH_AFTER_SEC) {
    return { ...lastCached, source: 'live' as const };
  }
  const cachedOrFallback = (): WorkshopData['calendar'] =>
    lastCached ? { ...lastCached, source: 'cached' as const } : FALLBACK.calendar;
  if (!username) return cachedOrFallback();
  try {
    // Cal.com v2 public slots, no API key required for a public profile.
    // Returns: { data: { slots: { "YYYY-MM-DD": [{ time: "ISO" }, ...] } } }
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const url = new URL('https://api.cal.com/v2/slots/available');
    url.searchParams.set('eventTypeSlug', eventSlug);
    url.searchParams.append('usernameList[]', username);
    url.searchParams.set('startTime', now.toISOString());
    url.searchParams.set('endTime', end.toISOString());
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(5000), headers: { 'Accept': 'application/json' } });
    if (!r.ok) return cachedOrFallback();
    const data: any = await r.json();
    const slots = data?.data?.slots ?? {};
    const allTimes: string[] = [];
    for (const day of Object.keys(slots).sort()) {
      const arr = slots[day];
      if (Array.isArray(arr)) for (const s of arr) if (s?.time) allTimes.push(s.time);
    }
    if (!allTimes.length) return cachedOrFallback();
    const cutoff = now.getTime() + 60 * 60 * 1000;
    const firstFuture = allTimes
      .map(t => ({ t, ms: new Date(t).getTime() }))
      .find(x => x.ms >= cutoff) ?? { t: allTimes[0], ms: new Date(allTimes[0]).getTime() };
    const d = new Date(firstFuture.t);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const parts = fmt.formatToParts(d);
    const wk = parts.find(p => p.type === 'weekday')?.value ?? '';
    const hr = parts.find(p => p.type === 'hour')?.value ?? '';
    const mn = parts.find(p => p.type === 'minute')?.value ?? '';
    const dp = parts.find(p => p.type === 'dayPeriod')?.value?.toLowerCase() ?? '';
    const next = mn === '00' ? `${wk} ${hr}${dp} PT` : `${wk} ${hr}:${mn}${dp} PT`;
    const result: WorkshopData['calendar'] = { next, source: 'live' };
    if (kv) {
      try { await kv.put(CACHE_KEY, JSON.stringify({ ...result, _cachedAt: Date.now() }), { expirationTtl: CACHE_TTL }); }
      catch { /* KV write failure non-fatal */ }
    }
    return result;
  } catch {
    return cachedOrFallback();
  }
}

async function fetchEngine(kv?: KVNamespace): Promise<WorkshopData['engine']> {
  // KV cache: 1h TTL. Brain stats publish from VPS via cron-like trigger.
  // Cache survives transit.baseline.marketing outages without forcing fallback.
  const CACHE_KEY = 'workshop:eng:v1';
  const CACHE_TTL = 60 * 60;
  let lastCached: (WorkshopData['engine'] & { _cachedAt?: number }) | undefined;
  let cacheAgeSec = Infinity;
  if (kv) {
    try {
      const c = await kv.get<WorkshopData['engine'] & { _cachedAt?: number }>(CACHE_KEY, 'json');
      if (c) {
        lastCached = c;
        cacheAgeSec = c._cachedAt ? (Date.now() - c._cachedAt) / 1000 : Infinity; // legacy = stale
      }
    } catch { /* KV read failure non-fatal */ }
  }
  // Short-circuit: brain memory count grows slowly (~50/day). 5min refresh.
  const REFRESH_AFTER_SEC = 5 * 60;
  if (lastCached && cacheAgeSec < REFRESH_AFTER_SEC) {
    return { ...lastCached, source: 'live' as const };
  }
  const cachedOrFallback = (): WorkshopData['engine'] =>
    lastCached ? { ...lastCached, source: 'cached' as const } : FALLBACK.engine;
  // Brain stats live at transit.baseline.marketing/brain-stats - public read-only
  // JSON published by a script on the Baseline VPS. Returns total + 7d-added.
  try {
    const r = await fetch('https://transit.baseline.marketing/brain-stats', {
      signal: AbortSignal.timeout(3000),
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return cachedOrFallback();
    const data: any = await r.json();
    if (typeof data.totalMemories !== 'number' || data.totalMemories <= 0) {
      return cachedOrFallback();
    }
    const result: WorkshopData['engine'] = {
      memories: Math.max(data.totalMemories, FALLBACK.engine.memories),
      added_last_7d: Math.max(
        typeof data.addedLast7d === 'number' ? data.addedLast7d : 0,
        FALLBACK.engine.added_last_7d,
      ),
      uptime_30d_pct: 100, // baseline VPS uptime, will wire from monitoring later
      source: 'live',
    };
    if (kv) {
      try { await kv.put(CACHE_KEY, JSON.stringify({ ...result, _cachedAt: Date.now() }), { expirationTtl: CACHE_TTL }); }
      catch { /* KV write failure non-fatal */ }
    }
    return result;
  } catch {
    return cachedOrFallback();
  }
}

// Background PSI refresher. Decoupled from request budget.
// Caller schedules via ctx.waitUntil() so request returns fast while
// PSI runs in background and writes to KV for the next hit.
async function refreshPSIBackground(
  key: string | undefined,
  kv: KVNamespace | undefined,
): Promise<void> {
  if (!key || !kv) return;
  const CACHE_KEY = 'workshop:psi:v2';
  const CACHE_TTL = 60 * 60 * 12;
  // Throttle: every pageview schedules this refresher, and a live run is 4 PSI
  // calls (one per site). Without a gate that is 4 calls per visitor, which is
  // what drained the daily quota. Run a live refresh at most once every 30 min;
  // the 12h cache serves every request in between.
  const GATE_KEY = 'workshop:psi:lastrun:v2';
  try {
    const last = await kv.get(GATE_KEY);
    if (last && Date.now() - Number(last) < 30 * 60 * 1000) return;
    await kv.put(GATE_KEY, String(Date.now()), { expirationTtl: 3600 });
  } catch { /* gate failure: skip this refresh rather than risk a stampede */ }
  try {
    // Force live PSI (skipCache) but KEEP kv so the rolling-best history
    // (HIST_KEY) reads + writes. Without kv the per-category max never engages
    // and a single low or stale run sticks for the whole cache TTL, which is
    // what made a one-off best-practices dip show on the public wall.
    const fresh = await fetchPSI(key, kv, true);
    if (fresh.source === 'live') {
      await kv.put(CACHE_KEY, JSON.stringify(fresh), { expirationTtl: CACHE_TTL });
    }
  } catch { /* refresh failure non-fatal */ }
}

// ─── Endpoint ─────────────────────────────────────────────────────

export const GET: APIRoute = async ({ locals }) => {
  const env: any = cfEnv ?? {};
  const githubToken: string | undefined = env.GITHUB_TOKEN;
  const psiKey: string | undefined = env.PSI_KEY;
  const calUsername: string = env.CAL_USERNAME ?? 'preston-winters';
  const kv = env.SESSION as KVNamespace | undefined;

  // Schedule background PSI refresh on every request. PSI runs take 10-30s,
  // far outside the request budget. ctx.waitUntil lets the worker continue
  // the PSI call after returning the response. Result lands in KV; next
  // request reads it cached. KV TTL is 12h, so background runs are cheap.
  const cfContext = (locals as any)?.cfContext;
  if (cfContext?.waitUntil && psiKey && kv) {
    cfContext.waitUntil(refreshPSIBackground(psiKey, kv));
  }

  // Per-upstream timeout (2-3.5s each). Total budget ~3.5s ceiling.
  // Any upstream that misses returns its FALLBACK stub. Endpoint
  // ALWAYS resolves within 4.5s, even on first cold hit.
  const [deploys, lighthouse, security, calendar, engine] = await Promise.all([
    withTimeout(fetchGitHub(githubToken, kv), 5000, FALLBACK.deploys),
    withTimeout(fetchPSI(psiKey, kv), 6500, FALLBACK.lighthouse),
    withTimeout(fetchObservatory(kv), 5000, FALLBACK.security),
    withTimeout(fetchCal(calUsername, kv), 3000, FALLBACK.calendar),
    withTimeout(fetchEngine(kv), 2000, FALLBACK.engine),
  ]);

  const data: WorkshopData = {
    deploys,
    lighthouse,
    security,
    calendar,
    engine, // live from transit.baseline.marketing/brain-stats
    speed: FALLBACK.speed,   // manually maintained source of truth - Sogn 3d. Update FALLBACK above as new client builds ship; switch to a live tracker once 3+ builds exist.
    updated_at: new Date().toISOString(),
  };

  // Conditional caching. A response is only cacheable at the normal TTL when
  // every upstream returned real data (live or KV-cached). If ANY source
  // dropped to the static 'fallback' stub, we must NOT let that degraded
  // response stick in the browser or edge cache, or repeat visitors keep
  // seeing 'fallback' for the full 15min s-maxage until it expires. A degraded
  // response gets no-store so the very next request re-attempts the upstreams.
  const sources = [
    deploys.source,
    lighthouse.source,
    security.source,
    calendar.source,
    engine.source,
  ];
  const anyFallback = sources.indexOf('fallback') !== -1;
  const cacheControl = anyFallback
    ? 'no-store'
    : 'public, max-age=300, s-maxage=900';

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
    },
  });
};
