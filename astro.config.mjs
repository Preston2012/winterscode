// @ts-check
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// ─────────── sitemap metadata, derived not guessed ───────────
// ONE git call, not one per page. `git log --name-only` over src/ yields
// every commit's date and the files it touched, walked newest first, so the
// first sighting of a path is its newest commit. 44 separate `git log -1`
// calls would do the same job and add seconds to every build.
let FILE_DATE = new Map();
try {
  const raw = execSync('git log --pretty=format:%cs --name-only --no-renames -- src astro.config.mjs',
    { cwd: import.meta.dirname, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  let d = null;
  for (const line of raw.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) { d = line; continue; }
    if (line && d && !FILE_DATE.has(line)) FILE_DATE.set(line, d);
  }
} catch {
  // No git in this environment. lastmod is then omitted entirely rather
  // than filled with a build stamp, because a wrong date is worse than none.
  FILE_DATE = new Map();
}

const SRC = resolve(import.meta.dirname, 'src/pages');
const dateCache = new Map();

/** Newest commit touching a page file or any local file it imports. */
function lastmodFor(route) {
  if (dateCache.has(route)) return dateCache.get(route);
  if (FILE_DATE.size === 0) { dateCache.set(route, null); return null; }
  const base = route === '/' ? 'index' : route.slice(1);
  const file = [`${base}.astro`, `${base}/index.astro`, `${base}.mdx`]
    .map((f) => resolve(SRC, f)).find((f) => existsSync(f));
  if (!file) { dateCache.set(route, null); return null; }

  // A page git has never seen is new and uncommitted. Inheriting a date from
  // one of its imports would stamp a brand new page with an old one, which is
  // the wrong-date-is-worse-than-none case this whole function exists to
  // avoid. Omit it; the next build after the commit picks up the real date.
  const own = relative(import.meta.dirname, file);
  if (!FILE_DATE.has(own)) { dateCache.set(route, null); return null; }

  const dates = [];
  const push = (abs) => {
    const rel = relative(import.meta.dirname, abs);
    if (FILE_DATE.has(rel)) dates.push(FILE_DATE.get(rel));
  };
  push(file);
  // One level of local imports: the template and the data module a page
  // renders from are as much its content as its own frontmatter.
  try {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      const bare = resolve(dirname(file), m[1]);
      for (const cand of [bare, `${bare}.astro`, `${bare}.ts`, `${bare}/index.ts`]) {
        if (existsSync(cand)) { push(cand); break; }
      }
    }
  } catch { /* unreadable page, its own date still stands */ }

  const out = dates.length ? dates.sort().at(-1) : null;
  dateCache.set(route, out);
  return out;
}

function routeOf(url) {
  const p = url.replace('https://winterscode.com', '').replace(/\/$/, '');
  return p === '' ? '/' : p;
}

// Named routes whose weight is not derivable from their shape.
const ROUTE_META = {
  '/': { priority: 1.0, changefreq: 'weekly' },
  '/work': { priority: 0.9, changefreq: 'weekly' },
  '/services': { priority: 0.9, changefreq: 'monthly' },
  '/pricing': { priority: 0.9, changefreq: 'monthly' },
  '/contact': { priority: 0.9, changefreq: 'monthly' },
  '/wall': { priority: 0.6, changefreq: 'daily' },
  '/changelog': { priority: 0.5, changefreq: 'daily' },
  '/audit': { priority: 0.7, changefreq: 'monthly' },
  '/about': { priority: 0.7, changefreq: 'monthly' },
  '/process': { priority: 0.7, changefreq: 'monthly' },
  '/faq': { priority: 0.7, changefreq: 'monthly' },
  '/insights': { priority: 0.6, changefreq: 'monthly' },
  '/credits': { priority: 0.3, changefreq: 'yearly' },
  '/privacy': { priority: 0.3, changefreq: 'yearly' },
  '/terms': { priority: 0.3, changefreq: 'yearly' },
  '/lamp': { priority: 0.5, changefreq: 'yearly' },
};

/** Everything else falls out of the route shape. */
function classify(route) {
  if (route.startsWith('/services/')) return { priority: 0.8, changefreq: 'monthly' };
  if (route.startsWith('/work/')) return { priority: 0.8, changefreq: 'monthly' };
  if (route.startsWith('/insights/')) return { priority: 0.7, changefreq: 'yearly' };
  return { priority: 0.8, changefreq: 'monthly' };  // location + industry pages
}

// https://astro.build/config
export default defineConfig({
  site: 'https://winterscode.com',

  // Cloudflare Pages adapter. Carried even on full-static output so the
  // build emits the worker shim & _routes.json needed by Pages, and so
  // future API endpoints (contact form, etc.) can drop in without a
  // config change.
  //
  // prerenderEnvironment: 'node' , Astro 6's Cloudflare adapter defaults
  // to using workerd (via miniflare) for static prerendering to mirror
  // production. That requires a local wrangler runtime to be reachable.
  // In CI / containers without wrangler, the prerenderer fails with
  // ECONNREFUSED. 'node' uses pure Node.js for SSG, which works
  // anywhere. On-demand routes (when we add the contact form endpoint)
  // still run in workerd in production , that's correct.
  // Docs: https://docs.astro.build/en/guides/integrations-guide/cloudflare/#prerenderenvironment
  adapter: cloudflare({
    prerenderEnvironment: 'node',
  }),
  output: 'static',

  // Native CSP via Astro 6 security.csp. Astro hashes Vite-bundled scripts +
  // integration-injected scripts + style blocks automatically.
  //
  // .astro component-body inline scripts are NOT auto-hashed by Astro. We
  // cover those via scripts/csp-postprocess.mjs which runs after build,
  // walks dist/client/**.html, computes SHA-256 of each remaining inline
  // <script>, and appends the hashes to the per-page CSP meta tag. Result
  // is a strict CSP with no 'unsafe-inline' on script-src so Lighthouse
  // Best-Practices passes.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://transit.baseline.marketing https://demi.baseline.marketing https://api.cal.com https://www.googleapis.com https://api.github.com https://observatory-api.mdn.mozilla.net https://www.sogncontracting.com https://sogncontracting.com",
        // frame-ancestors omitted: ignored when delivered via <meta>.
        // X-Frame-Options: SAMEORIGIN at the response header handles this.
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ],
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },

  integrations: [
    // @astrojs/react intentionally NOT included yet. Will add back in S8
    // when the chat demo island needs hydration. Pulling React in early
    // ships a 193KB runtime even when no island uses it (Astro emits
    // the client bundle regardless). Cost > benefit until we have a
    // real interactive island worth that weight.
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize: (item) => {
        const route = routeOf(item.url);
        return {
          ...item,
          ...(ROUTE_META[route] ?? classify(route)),
          ...(lastmodFor(route) ? { lastmod: lastmodFor(route) } : {}),
        };
      },
    }),
  ],

  // Tailwind v4 wired via PostCSS (Astro 6 / rolldown-vite compatibility).
  // See GitHub astro/issues/16542 for why we don't use @tailwindcss/vite here.
  vite: {
    css: {
      transformer: 'postcss',
    },
    // Raise the inline-asset threshold from the Vite default of 4096
    // bytes to 65536 bytes (64KB). Lighthouse mobile run flagged ~1,580ms of
    // render-blocking CSS from four per-component chunks at 2-9KB each
    // (BaseLayout, Contact, Divider, index). Inlining adds ~60KB raw
    // (~12KB gzipped) to the HTML payload but removes all blocking
    // round-trips on
    // mobile networks. Net win on LCP (2.9s -> ~1.5s target).
    build: {
      assetsInlineLimit: 4096,  // back to default , inlineStylesheets:'always' handles CSS
    },
  },

  // Compress HTML in build output. Lighthouse 95+ requires this.
  compressHTML: true,

  // Trailing slash off , keep URLs clean for SEO.
  trailingSlash: 'never',

  build: {
    // Emit `services.html` not `services/index.html`. With trailingSlash:'never'
    // and the default 'directory' format, every non-home request 307-redirects
    // to the trailing-slash variant. Sitemap lists non-trailing-slash URLs, so
    // every Googlebot crawl wastes a redirect hop. format:'file' aligns the
    // file layout with the canonical URL shape , zero redirects, full SEO equity.
    // Verified: zero hardcoded /path/ trailing-slash links in source.
    format: 'file',
    // 'auto' splits CSS: small per-component scoped styles stay inline,
    // larger bundles (Tailwind + globals + Tangle + Wall + Instrument) become
    // hashed <link rel='stylesheet'> with immutable cache headers. The 83KB
    // inline blob from 'always' was blocking the HTML parser on slow CPUs
    // (PSI bench <500 → perf 92-94). With 'auto', browsers parallel-fetch
    // CSS during HTML stream, total bytes are smaller per request, and
    // repeat visits cache.
    inlineStylesheets: 'always',
  },
});
