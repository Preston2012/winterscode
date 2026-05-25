// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

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
      changefreq: 'weekly',
      priority: 0.8,
      filter: (page) => !page.includes('/404'),
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
