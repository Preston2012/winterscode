/**
 * /api/limit : proxy for the Instrument widget's "messages left today" label.
 *
 * Astro 6 server endpoint, runs as a Cloudflare Worker. The browser fetches
 * this on page load (no message spent) so the label reflects the real
 * upstream counter for the visitor's IP. Without this the label stayed at
 * the static "5 messages per day" string until the first send refreshed it
 * via SSE metadata, which lied to anyone refreshing mid-day.
 *
 * Forwards the visitor's CF-Connecting-IP so the upstream identifies the
 * real client (Caddy in front of demi-api would otherwise rewrite XFF to
 * the proxy hop address and collapse every visitor into one bucket).
 *
 * Returns { dailyCount, dailyLimit, resetsAt } verbatim from upstream, or
 * a small error JSON on failure. Never blocks the page: callers swallow
 * errors and fall back to the static label.
 *
 * Env vars required:
 *   - WC_DEMO_TOKEN: shared secret matching demi-api's WC_DEMO_TOKEN
 *   - WC_DEMO_UPSTREAM (optional, default https://demi.baseline.marketing)
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

const DEFAULT_UPSTREAM = 'https://demi.baseline.marketing';

export const GET: APIRoute = async ({ request }) => {
  const token = (cfEnv as Record<string, string | undefined>).WC_DEMO_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'demo_not_configured' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  const upstream =
    (cfEnv as Record<string, string | undefined>).WC_DEMO_UPSTREAM ??
    DEFAULT_UPSTREAM;

  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    '0.0.0.0';

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${upstream}/api/v1/wc-demo/limit`, {
      method: 'GET',
      headers: {
        'x-wc-demo-token': token,
        'cf-connecting-ip': clientIp,
        'x-forwarded-for': clientIp,
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'upstream_unreachable' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      'content-type': 'application/json',
      // No caching: the label must reflect the live count, and this is a
      // cheap upstream call (no LLM, just a SQLite read).
      'cache-control': 'no-store',
    },
  });
};
