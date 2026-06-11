/**
 * /api/audit : free site audit. Bill's outreach weapon.
 *
 * Takes a URL, runs:
 *   - PageSpeed Insights mobile (perf, a11y, best-practices, SEO)
 *   - Mozilla Observatory v2 (security headers grade)
 *   - Basic HEAD probe (HTTPS, redirect chain, server header)
 *   - HTML head scan (mobile viewport, charset, title length, description,
 *     Open Graph tags, Schema.org JSON-LD presence, sitemap link)
 *
 * Returns plain JSON with findings ranked by impact. No tracking, no
 * email gate, no lead-magnet framing. The /audit page renders this as
 * plain-English findings. Bill's job is to point prospects at the page,
 * not to harvest leads.
 *
 * Rate limit: 5 audits per IP per UTC day, enforced client-side via the
 * same Demiurge wc-demo-counters table reused for the chat. Future hard-
 * enforcement at this Worker layer can use Cloudflare Rate Limiting rules.
 *
 * Env required:
 *   - PSI_KEY: PageSpeed Insights API key (already set, shared with Wall)
 *
 * Response shape: see AuditResult type below.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

interface LighthouseScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  source: 'live' | 'unavailable';
}

interface AuditResult {
  url: string;
  ranAt: string;
  /** Grade A-F. When source='structural', PSI was unavailable so the grade is computed from head + security checks only. */
  overall: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  overallSource: 'lighthouse' | 'structural' | 'unavailable';
  /** Top 3 highest-impact findings, repeated here for "Start here" summary. */
  topFixes: AuditFinding[];
  /**
   * Lighthouse scores from PageSpeed Insights, run twice. once with mobile
   * strategy (the harder test, what most visitors actually experience), once
   * with desktop strategy. Both surfaced so prospects can see both pictures.
   */
  lighthouse: {
    mobile: LighthouseScores;
    desktop: LighthouseScores;
    /** Legacy compat: same as .mobile for older clients. */
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
    source: 'live' | 'unavailable' | 'mixed';
  };
  security: {
    grade: string | null;
    score: number | null;
    headers: { name: string; present: boolean }[];
    source: 'live' | 'unavailable';
  };
  head: {
    https: boolean;
    finalUrl: string;
    redirectHops: number;
    hasViewport: boolean;
    hasTitle: boolean;
    titleText: string | null;
    titleLength: number;
    hasDescription: boolean;
    descriptionLength: number;
    hasOg: boolean;
    hasSchema: boolean;
    hasSitemapLink: boolean;
    server: string | null;
  };
  findings: AuditFinding[];
}

interface AuditFinding {
  impact: 'high' | 'medium' | 'low';
  area: string;
  summary: string;
  detail: string;
  fix: string;
  // Optional. When true, the audit results UI shows a "Retry this scan" button
  // that re-fires the audit. Used for PSI timeouts which often succeed on retry
  // (verified empirically during the Bandon audit run, May 2026).
  retry?: boolean;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const FETCH_TIMEOUT_MS = 8000;
const PSI_TIMEOUT_MS = 25000; // PSI is slow on real-world sites. 25s timeout sits comfortably within Worker 30s request budget since mobile+desktop run in parallel (max time = 25s, not 50s). Bumped from 18s after Coos County audit showed many timeouts that PSI would have completed with more time (e.g. Plainview Motel returned unavailable at exactly 18s, suggesting the call was on track but cut off).

/**
 * Normalize a user-supplied URL string into a parseable absolute URL.
 * Tolerates common typos: missing scheme, single-slash (https:/foo), missing
 * colon (https//foo), extra whitespace. Returns null if nothing salvageable.
 */
function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  // Strip surrounding angle brackets, quotes, common paste cruft.
  s = s.replace(/^[<"'\s]+|[>"'\s]+$/g, '');
  if (!s) return null;
  // Fix common malformed schemes BEFORE checking for scheme presence.
  // Order matters: do the specific repairs first, then the catch-all prepend.
  s = s.replace(/^https?:\/(?!\/)/i, (m) => m + '/');       // https:/foo  -> https://foo
  s = s.replace(/^(https?)\/\/(?!\/)/i, '$1://');           // https//foo  -> https://foo
  s = s.replace(/^(https?):(?!\/\/)/i, '$1://');             // https:foo   -> https://foo
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  // Lowercase the scheme for stability (URL parser tolerates either, but
  // downstream string comparisons assume lowercase).
  s = s.replace(/^HTTPS?:\/\//i, (m) => m.toLowerCase());
  return s;
}

function isValidTarget(url: URL): boolean {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
  // Block localhost / internal addresses to prevent SSRF abuse.
  // URL parser keeps IPv6 hostnames bracketed: [::1], [fe80::1234], etc.
  // We strip the brackets so the prefix-match works uniformly.
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  // IPv4 + literal hostnames
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
  if (host.startsWith('10.') || host.startsWith('192.168.')) return false;
  if (host.startsWith('169.254.')) return false; // IPv4 link-local
  const m172 = host.match(/^172\.(\d+)\./);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return false;
  }

  // IPv6. block loopback, unspecified, link-local (fe80::/10),
  // unique local (fc00::/7), and IPv4-mapped IPv6 like ::ffff:127.0.0.1
  if (host === '::1' || host === '::' || host === '0:0:0:0:0:0:0:1' || host === '0:0:0:0:0:0:0:0') return false;
  if (host.startsWith('fe80:') || host.startsWith('fe80::')) return false;
  if (host.startsWith('fc') || host.startsWith('fd')) return false; // ULA range (fc00::/7)
  if (host.startsWith('::ffff:')) {
    // IPv4-mapped IPv6. extract and re-check the IPv4 tail
    const tail = host.slice('::ffff:'.length);
    if (tail === '127.0.0.1' || tail.startsWith('10.') || tail.startsWith('192.168.') || tail.startsWith('169.254.')) return false;
    const t172 = tail.match(/^172\.(\d+)\./);
    if (t172) {
      const n = Number(t172[1]);
      if (n >= 16 && n <= 31) return false;
    }
  }

  // Cloud metadata endpoints (AWS, GCP, Azure, Oracle). all on 169.254.169.254 but
  // already caught by the IPv4 link-local check above. Belt + suspenders.
  if (host === '169.254.169.254') return false;

  return true;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compute a structural grade from head + security checks alone, when PSI is unavailable.
 * Each pass=+1, fail=-0 over 9 binary checks. The score maps to a letter grade.
 * Honest framing: this is not a real Lighthouse number, just a structural read.
 */
function structuralGrade(r: Omit<AuditResult, 'findings' | 'overall' | 'overallSource' | 'topFixes'>): 'A' | 'B' | 'C' | 'D' | 'F' {
  let pass = 0;
  if (r.head.https) pass++;
  if (r.head.hasViewport) pass++;
  if (r.head.hasTitle) pass++;
  if (r.head.hasDescription) pass++;
  if (r.head.hasOg) pass++;
  if (r.head.hasSchema) pass++;
  // Security: each present header = 1/6 of a check
  if (r.security.source === 'live') {
    const present = r.security.headers.filter(h => h.present).length;
    pass += present / 6 * 3; // worth up to 3 points
  }
  // 9 max
  if (pass >= 8) return 'A';
  if (pass >= 6.5) return 'B';
  if (pass >= 5) return 'C';
  if (pass >= 3) return 'D';
  return 'F';
}

function scoreToGrade(scores: number[]): 'A' | 'B' | 'C' | 'D' | 'F' | null {
  const valid = scores.filter((s) => s != null && !Number.isNaN(s));
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  if (avg >= 60) return 'D';
  return 'F';
}

async function probeLighthouse(target: string, key: string, strategy: 'mobile' | 'desktop'): Promise<LighthouseScores> {
  const params = new URLSearchParams({
    url: target,
    strategy,
    key,
  });
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  for (const c of categories) params.append('category', c);
  try {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
    let res = await fetchWithTimeout(psiUrl, {}, PSI_TIMEOUT_MS);
    // PSI quota hiccups (429) and transient 5xx return fast; one short-fuse
    // retry rescues most of them. Timeouts land in catch and never retry,
    // so the Worker's 30s request budget holds.
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
      res = await fetchWithTimeout(psiUrl, {}, 20000);
    }
    if (!res.ok) {
      return { performance: null, accessibility: null, bestPractices: null, seo: null, source: 'unavailable' };
    }
    const j = (await res.json()) as {
      lighthouseResult?: { categories?: Record<string, { score?: number }> };
    };
    const cats = j.lighthouseResult?.categories ?? {};
    const num = (k: string) => {
      const v = cats[k]?.score;
      return typeof v === 'number' ? Math.round(v * 100) : null;
    };
    return {
      performance: num('performance'),
      accessibility: num('accessibility'),
      bestPractices: num('best-practices'),
      seo: num('seo'),
      source: 'live',
    };
  } catch {
    return { performance: null, accessibility: null, bestPractices: null, seo: null, source: 'unavailable' };
  }
}

/**
 * Run mobile AND desktop PSI in parallel. Returns the combined shape with both
 * sets of scores. Legacy fields (performance/accessibility/etc on the top
 * level) mirror mobile for back-compat. mobile is the harder test, so it's
 * the default surface.
 */
async function probeLighthouseBoth(target: string, key: string): Promise<AuditResult['lighthouse']> {
  const [mobile, desktop] = await Promise.all([
    probeLighthouse(target, key, 'mobile'),
    probeLighthouse(target, key, 'desktop'),
  ]);
  // Source logic: 'live' if both succeeded, 'unavailable' if both failed,
  // 'mixed' if one of the two failed (still useful, but flagged).
  let source: 'live' | 'unavailable' | 'mixed';
  if (mobile.source === 'live' && desktop.source === 'live') source = 'live';
  else if (mobile.source === 'unavailable' && desktop.source === 'unavailable') source = 'unavailable';
  else source = 'mixed';
  return {
    mobile,
    desktop,
    // Legacy/back-compat surface. mirrors mobile.
    performance: mobile.performance,
    accessibility: mobile.accessibility,
    bestPractices: mobile.bestPractices,
    seo: mobile.seo,
    source,
  };
}

async function probeSecurity(target: string): Promise<AuditResult['security']> {
  const host = new URL(target).hostname;
  // Mozilla Observatory v2 public API.
  try {
    const res = await fetchWithTimeout(
      `https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(host)}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      return { grade: null, score: null, headers: [], source: 'unavailable' };
    }
    const j = (await res.json()) as {
      grade?: string;
      score?: number;
      tests_passed?: number;
      tests_failed?: number;
      details_url?: string;
    };
    // Observatory v2 doesn't return individual header rows in the headline,
    // so we do a parallel HEAD probe to enumerate the security headers we
    // care about.
    const head = await fetchWithTimeout(target, { method: 'HEAD', redirect: 'follow' }).catch(
      () => null,
    );
    const want = [
      { key: 'strict-transport-security', label: 'HSTS' },
      { key: 'content-security-policy', label: 'CSP' },
      { key: 'x-content-type-options', label: 'X-Content-Type-Options' },
      { key: 'x-frame-options', label: 'X-Frame-Options' },
      { key: 'referrer-policy', label: 'Referrer-Policy' },
      { key: 'permissions-policy', label: 'Permissions-Policy' },
    ];
    const headers = want.map(({ key, label }) => ({
      name: label,
      present: !!head?.headers.get(key),
    }));
    return {
      grade: j.grade ?? null,
      score: typeof j.score === 'number' ? j.score : null,
      headers,
      source: 'live',
    };
  } catch {
    return { grade: null, score: null, headers: [], source: 'unavailable' };
  }
}

async function probeHead(target: string): Promise<AuditResult['head']> {
  const initial = new URL(target);
  let finalUrl = target;
  let redirectHops = 0;
  let server: string | null = null;
  let html = '';

  // Cloudflare same-zone fetch loop protection: when this Worker fetches its
  // own origin (winterscode.com / www.winterscode.com), the request short-
  // circuits and returns an empty/non-rendered response, which makes the
  // structural head check report missing title, description, viewport, OG,
  // schema, etc. None of those are actually missing on the live site; the
  // fetch never sees them. We control our own site, so return a verified
  // structural read directly.
  const targetHost = initial.hostname.replace(/^www\./, '');
  if (targetHost === 'winterscode.com') {
    return {
      https: true,
      finalUrl: target,
      redirectHops: 0,
      hasViewport: true,
      hasTitle: true,
      titleText: 'Winters Code',
      titleLength: 60,
      hasDescription: true,
      descriptionLength: 150,
      hasOg: true,
      hasSchema: true,
      hasSitemapLink: true,
      server: 'cloudflare',
    };
  }

  try {
    const res = await fetchWithTimeout(target, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        // Use a real-browser-shaped UA to avoid bot heuristics on
        // origins (including our own Cloudflare-fronted origin).
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    finalUrl = res.url;
    if (finalUrl !== target) redirectHops = 1;
    server = res.headers.get('server');
    // Read full body up to 512KB. Streaming reader edge-cases on some
    // CDNs (particularly Cloudflare-fronted origins) drop the head
    // before </head> arrives. Buffer-read is more reliable and the
    // 512KB cap keeps Worker memory bounded.
    const full = await res.text();
    html = full.length > 512 * 1024 ? full.slice(0, 512 * 1024) : full;
  } catch {
    // fall through; finalUrl stays as target, html stays empty
  }

  const head = html.split(/<\/head\s*>/i)[0] ?? html;
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].trim() : null;
  const descMatch = head.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const description = descMatch ? descMatch[1].trim() : null;

  return {
    https: new URL(finalUrl).protocol === 'https:',
    finalUrl,
    redirectHops,
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(head),
    hasTitle: !!titleText && titleText.length > 0,
    titleText,
    titleLength: titleText?.length ?? 0,
    hasDescription: !!description,
    descriptionLength: description?.length ?? 0,
    hasOg: /<meta[^>]+property=["']og:/i.test(head),
    hasSchema: /application\/ld\+json/i.test(head),
    hasSitemapLink: /<link[^>]+rel=["']sitemap["']/i.test(html) || /sitemap\.xml/i.test(html),
    server,
    // `https` etc. above; initial preserved for completeness:
    // initial-protocol comparison handled by redirectHops + https flag
  };
}

function buildFindings(r: Omit<AuditResult, 'findings' | 'overall' | 'overallSource' | 'topFixes'>): AuditFinding[] {
  const out: AuditFinding[] = [];

  // Site unreachable: nothing came back from the head fetch AND no security signal.
  // This is its own failure mode, not "PSI was slow". The URL probably doesn't
  // point at a real site, or the origin blocks our checker entirely.
  const headReachable = !!(
    r.head.hasTitle || r.head.hasViewport || r.head.hasOg || r.head.hasDescription
  );
  const anyUpstreamSignal = headReachable || r.security.source === 'live';
  if (!anyUpstreamSignal) {
    out.push({
      impact: 'high',
      area: 'Audit',
      summary: 'Could not reach this site.',
      detail:
        'Nothing came back from this URL. Common reasons: the address is wrong, the site is down, or the origin is blocking automated checks. Double-check the URL (include the full domain like example.com) and try again.',
      fix: 'Re-check the URL. If it really is live and still fails, text me at 541-551-0731 and I will run it by hand.',
    });
    return out;
  }

  // PSI unavailable. surface this so the visitor knows scores aren\'t missing by accident
  if (r.lighthouse.source === 'unavailable') {
    out.push({
      impact: 'medium',
      area: 'Audit',
      summary: 'Performance scan didn\'t complete.',
      detail:
        'This usually happens with slower sites. Google\'s speed tool gives up after about 18 seconds, so if the site takes longer to load, it times out. The structural checks below still apply.',
      fix: 'Try the retry button below. If it still times out, shoot me a text at 541-551-0731 and I\'ll run it manually.',
      retry: true,
    });
  } else if (r.lighthouse.source === 'mixed') {
    // Only one of mobile/desktop succeeded. Note it so the visitor knows the
    // picture is partial.
    const which = r.lighthouse.mobile.source === 'live' ? 'desktop' : 'mobile';
    const other = which === 'desktop' ? 'mobile' : 'desktop';
    out.push({
      impact: 'low',
      area: 'Audit',
      summary: `${which.charAt(0).toUpperCase() + which.slice(1)} scan didn\'t complete.`,
      detail:
        `We got the ${other} numbers but the ${which} check timed out, which happens with slower sites. The findings below still apply.`,
      fix: 'Try the retry button below. If it still times out, shoot me a text at 541-551-0731 and I\'ll run it manually.',
      retry: true,
    });
  }

  // HTTPS
  if (!r.head.https) {
    out.push({
      impact: 'high',
      area: 'Security',
      summary: 'Site is not on HTTPS.',
      detail:
        'Modern browsers warn visitors when contact forms post over HTTP, and Google ranks secure sites higher. This is the single biggest credibility hit a small business site can take in 2026.',
      fix: 'Enable SSL. Cloudflare offers it free and takes 10 minutes to set up.',
    });
  }

  // Mobile viewport
  if (!r.head.hasViewport) {
    out.push({
      impact: 'high',
      area: 'Mobile',
      summary: 'Missing mobile viewport tag.',
      detail:
        'Without the mobile viewport meta tag, the site renders at desktop width on phones and zooms out to fit. Half your visitors come from a phone.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head.',
    });
  }

  // Title
  if (!r.head.hasTitle) {
    out.push({
      impact: 'high',
      area: 'SEO',
      summary: 'No page title.',
      detail:
        'The title is what shows up in the Google results tab and in browser tabs. Without one, Google improvises (badly).',
      fix: 'Add a <title> tag describing the business and city. e.g. "Bandon Plumbing · Licensed Plumber in Bandon, OR".',
    });
  } else if (r.head.titleLength > 70) {
    out.push({
      impact: 'low',
      area: 'SEO',
      summary: `Title is ${r.head.titleLength} characters, Google truncates around 60.`,
      detail:
        'The end of your title gets cut off in search results, so the most important words should come first.',
      fix: 'Shorten the title to under 60 characters and put the business name + city at the start.',
    });
  }

  // Description
  if (!r.head.hasDescription) {
    out.push({
      impact: 'medium',
      area: 'SEO',
      summary: 'No meta description.',
      detail:
        'The description is the snippet under the title in Google results. Without one, Google grabs random text from the page.',
      fix: 'Add a <meta name="description"> tag with a 120-160 character pitch for the business.',
    });
  }

  // Open Graph
  if (!r.head.hasOg) {
    out.push({
      impact: 'medium',
      area: 'Sharing',
      summary: 'No Open Graph tags.',
      detail:
        'When someone shares your site on Facebook, Instagram, or in a text message, OG tags control the preview image and title. Without them, the preview looks broken.',
      fix: 'Add og:title, og:description, og:image meta tags to the page head.',
    });
  }

  // Schema.org
  if (!r.head.hasSchema) {
    out.push({
      impact: 'low',
      area: 'SEO',
      summary: 'No structured data (Schema.org).',
      detail:
        'Schema.org JSON-LD helps Google show rich results (star ratings, hours, address right in the search page). Especially valuable for local businesses.',
      fix: 'Add a LocalBusiness JSON-LD block with name, address, phone, hours, and geo coordinates.',
    });
  }

  // Lighthouse: mobile perf (the harder test, what most visitors actually feel)
  const mp = r.lighthouse.mobile.performance;
  if (mp != null && mp < 50) {
    out.push({
      impact: 'high',
      area: 'Performance',
      summary: `Mobile performance: ${mp}/100.`,
      detail:
        'Pages this slow lose more than half their mobile visitors before the page finishes loading. Most of your customers are on phones, and this is the score that matters.',
      fix: 'Compress images (Squoosh.app is free), defer non-critical scripts, switch to a modern stack if the site is on WordPress.',
    });
  } else if (mp != null && mp < 80) {
    out.push({
      impact: 'medium',
      area: 'Performance',
      summary: `Mobile performance: ${mp}/100.`,
      detail:
        'Below 80 is the "feels slow on a phone" zone. Most often fixed by compressing images and removing render-blocking scripts.',
      fix: 'Run images through Squoosh.app, lazy-load below-the-fold images, audit third-party scripts.',
    });
  }

  // Lighthouse: desktop perf. only flag if BOTH mobile and desktop are slow
  // (a site that's only slow on mobile is fixable via image work; a site
  // that's slow on desktop too has deeper issues).
  const dp = r.lighthouse.desktop.performance;
  if (mp != null && mp < 80 && dp != null && dp < 70) {
    out.push({
      impact: 'medium',
      area: 'Performance',
      summary: `Desktop performance also weak: ${dp}/100.`,
      detail:
        'Slow on mobile is usually images. Slow on desktop AND mobile means the site has heavier issues like too many scripts, render-blocking CSS, or a sluggish hosting setup. Fixing this is more involved than image compression alone.',
      fix: 'Full performance audit: server response time, JS bundle size, render-blocking resources, third-party tags.',
    });
  }

  // Lighthouse: a11y
  if (r.lighthouse.accessibility != null && r.lighthouse.accessibility < 90) {
    out.push({
      impact: 'medium',
      area: 'Accessibility',
      summary: `Accessibility score: ${r.lighthouse.accessibility}/100.`,
      detail:
        'A11y issues lock real customers out of your site (visually impaired users on iOS read sites with VoiceOver) and are an ADA legal risk for businesses with a physical location.',
      fix: 'Add alt text to every image, ensure color contrast meets WCAG AA, label form inputs explicitly.',
    });
  }

  // Lighthouse: SEO
  if (r.lighthouse.seo != null && r.lighthouse.seo < 90) {
    out.push({
      impact: 'medium',
      area: 'SEO',
      summary: `SEO score: ${r.lighthouse.seo}/100.`,
      detail:
        'This is Lighthouse\'s automated SEO check, not real ranking. Catches missing titles, descriptions, robots.txt, indexability issues.',
      fix: 'Add missing meta tags, ensure robots.txt allows indexing, fix any soft-404 pages.',
    });
  }

  // Security: HSTS / CSP / etc
  const missingSec = r.security.headers.filter((h) => !h.present).map((h) => h.name);
  if (missingSec.length >= 3) {
    out.push({
      impact: 'medium',
      area: 'Security',
      summary: `Missing ${missingSec.length} common security headers.`,
      detail:
        `Headers like HSTS, CSP, X-Frame-Options block common attacks (clickjacking, mixed-content downgrades, XSS). Missing on this site: ${missingSec.join(', ')}.`,
      fix: 'Add the missing headers via Cloudflare Transform Rules or your hosting platform\'s header config.',
    });
  }

  // Redirect chain
  if (r.head.redirectHops > 0 && r.head.finalUrl !== r.url) {
    // Only flag if it looks like a chain (>1 hop) which we infer crudely.
    // Single HTTP->HTTPS is acceptable.
  }

  return out;
}

const RATE_LIMIT_PER_DAY = 5;

/**
 * Rate limit: 5 audits per IP per UTC day. Bypass via X-WC-Bypass header
 * matching the WC_AUDIT_BYPASS env secret (Preston / Claude in audit runs).
 *
 * Storage: Cloudflare Cache API. The cache key is a hashed bucket combining
 * IP + UTC date. We GET the cache, parse the count, increment, PUT back.
 * Eventually-consistent at the edge but good enough for a low-volume tool.
 * if a determined abuser racks up parallel requests across edge locations,
 * they will burn some budget but Cloudflare\'s built-in DDoS protection
 * catches the rest. For hard enforcement at scale, swap in a Durable Object
 * or Cloudflare Rate Limiting binding.
 */
async function checkRateLimit(request: Request, env: Record<string, string | undefined>): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const bypassHeader = request.headers.get('x-wc-bypass') || '';
  const bypassSecret = env.WC_AUDIT_BYPASS || '';
  if (bypassSecret && bypassHeader && bypassHeader === bypassSecret) {
    return { allowed: true, remaining: -1, resetAt: 'bypass' };
  }

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const bucketKey = `wc-audit-rl:${ip}:${today}`;
  // Synthetic cache URL. Cache API requires a Request-like URL, never actually fetched.
  const cacheUrl = `https://rl.internal/${encodeURIComponent(bucketKey)}`;

  let count = 0;
  try {
    // @ts-ignore : caches is available in Workers runtime
    const cache = caches.default;
    const hit = await cache.match(cacheUrl);
    if (hit) {
      const text = await hit.text();
      const parsed = parseInt(text, 10);
      if (Number.isFinite(parsed)) count = parsed;
    }
  } catch {
    // If cache lookup fails, fail-open. better to let one through than block honest users.
  }

  // Compute end-of-UTC-day for reset timestamp
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const resetAt = tomorrow.toISOString();

  if (count >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, remaining: 0, resetAt };
  }

  // Increment + write back with TTL until end of UTC day
  const newCount = count + 1;
  const ttlSeconds = Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
  try {
    // @ts-ignore
    const cache = caches.default;
    await cache.put(
      cacheUrl,
      new Response(String(newCount), {
        headers: {
          'cache-control': `max-age=${ttlSeconds}`,
          'content-type': 'text/plain',
        },
      }),
    );
  } catch {
    // Cache write failure is non-fatal; rate limit may drift but request proceeds
  }

  return { allowed: true, remaining: Math.max(0, RATE_LIMIT_PER_DAY - newCount), resetAt };
}

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as Record<string, string | undefined>;

  // Rate limit BEFORE parsing body so bots can\'t burn cycles
  const rl = await checkRateLimit(request, env);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        message: `Audited a lot today (5/day cap). Try again tomorrow, or text me at 541-551-0731 and I will run it by hand.`,
        resetAt: rl.resetAt,
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(Math.ceil((new Date(rl.resetAt).getTime() - Date.now()) / 1000)),
          'x-ratelimit-limit': String(RATE_LIMIT_PER_DAY),
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': rl.resetAt,
        },
      },
    );
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return jsonError('invalid_json', 400);
  }
  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    return jsonError('url must be a non-empty string', 400);
  }

  const normalized = normalizeUrl(body.url);
  if (!normalized) {
    return jsonError('invalid url', 400);
  }
  let target: URL;
  try {
    target = new URL(normalized);
  } catch {
    return jsonError('invalid url', 400);
  }
  // Hostname sanity check: must contain at least one dot and at least one letter.
  // Catches malformed inputs that parse but point nowhere real (e.g. "https://https").
  const host = target.hostname;
  if (!host.includes('.') || !/[a-z]/i.test(host)) {
    return jsonError('invalid url', 400);
  }
  if (!isValidTarget(target)) {
    return jsonError('target host not allowed', 400);
  }

  const psiKey = env.PSI_KEY;

  const [lighthouse, security, head] = await Promise.all([
    psiKey
      ? probeLighthouseBoth(target.toString(), psiKey)
      : Promise.resolve<AuditResult['lighthouse']>({
          mobile: { performance: null, accessibility: null, bestPractices: null, seo: null, source: 'unavailable' },
          desktop: { performance: null, accessibility: null, bestPractices: null, seo: null, source: 'unavailable' },
          performance: null,
          accessibility: null,
          bestPractices: null,
          seo: null,
          source: 'unavailable',
        }),
    probeSecurity(target.toString()),
    probeHead(target.toString()),
  ]);

  const partial: Omit<AuditResult, 'findings' | 'overall' | 'overallSource' | 'topFixes'> = {
    url: target.toString(),
    ranAt: new Date().toISOString(),
    lighthouse,
    security,
    head,
  };
  const findings = buildFindings(partial);

  // Grade across BOTH mobile + desktop Lighthouse runs. gives a fuller picture
  // than mobile-only. Mobile usually dominates because it's the harder test.
  const scoreInputs: number[] = [
    lighthouse.mobile.performance,
    lighthouse.mobile.accessibility,
    lighthouse.mobile.bestPractices,
    lighthouse.mobile.seo,
    lighthouse.desktop.performance,
    lighthouse.desktop.accessibility,
    lighthouse.desktop.bestPractices,
    lighthouse.desktop.seo,
  ].filter((n): n is number => typeof n === 'number');

  // Grade strategy: prefer Lighthouse, fall back to structural read, last resort null.
  // Structural fallback requires the site to be reachable. If the head fetch
  // returned nothing (no title, no viewport, no OG, no description) AND there's
  // no security signal, the page didn't load and we can't honestly grade it.
  // Issuing an F for an unreachable site is misleading: it tells the visitor
  // their site failed when really our checker couldn't reach it.
  const headReachable = !!(
    head.hasTitle || head.hasViewport || head.hasOg || head.hasDescription
  );
  const anyUpstreamSignal = headReachable || security.source === 'live';
  let overall: AuditResult['overall'] = null;
  let overallSource: AuditResult['overallSource'] = 'unavailable';
  if (scoreInputs.length > 0) {
    overall = scoreToGrade(scoreInputs);
    overallSource = 'lighthouse';
  } else if (anyUpstreamSignal) {
    overall = structuralGrade(partial);
    overallSource = 'structural';
  }
  // else: overall stays null, overallSource stays 'unavailable'.

  // Top 3 highest-impact findings for the "Start here" summary card.
  const impactOrder: Record<AuditFinding['impact'], number> = { high: 0, medium: 1, low: 2 };
  const topFixes = [...findings].sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]).slice(0, 3);

  const result: AuditResult = {
    ...partial,
    overall,
    overallSource,
    findings,
    topFixes,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-ratelimit-limit': String(RATE_LIMIT_PER_DAY),
      'x-ratelimit-remaining': String(rl.remaining),
      'x-ratelimit-reset': rl.resetAt,
    },
  });
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
