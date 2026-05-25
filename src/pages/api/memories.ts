/**
 * /api/memories : proxy for the Instrument widget's memory side panel.
 *
 * Astro 6 server endpoint on Cloudflare Workers. Forwards GET to demi-api at
 * /api/v1/wc-demo/memories with the X-WC-Demo-Token header. The upstream
 * scopes memories to wc-demo:<sha(ip + utc-date)>, so we MUST forward the
 * visitor's real IP via X-Forwarded-For for the partition to match the
 * chat endpoint's partition.
 *
 * Returns { partition, memories: [{ id, subject, claim, createdAt }] }
 *
 * Called once per chat turn (after the `done` SSE event fires) by the
 * Instrument widget. Cheap enough to not need browser-side caching.
 *
 * Env vars required:
 *   - WC_DEMO_TOKEN: shared secret matching demi-api
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
      JSON.stringify({ error: 'demo_not_configured', memories: [] }),
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
    upstreamRes = await fetch(`${upstream}/api/v1/wc-demo/memories`, {
      method: 'GET',
      headers: {
        'x-wc-demo-token': token,
        'cf-connecting-ip': clientIp,
      'x-forwarded-for': clientIp,
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'upstream_unreachable', memories: [] }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: {
      'content-type': 'application/json',
      // Short cache so back-to-back calls don't hammer upstream.
      'cache-control': 'private, max-age=5',
    },
  });
};
