/**
 * /api/chat : proxy for the Instrument widget's chat surface.
 *
 * Astro 6 server endpoint, runs as a Cloudflare Worker. Receives a POST
 * with {message} from the browser, forwards to demi-api at
 * https://demi.baseline.marketing/api/v1/wc-demo with the X-WC-Demo-Token
 * header (held in CF env, never exposed to the browser).
 *
 * Streams SSE response back to the client unchanged. The browser-side
 * client (in Instrument.astro) does its own SSE parsing + throttled
 * rendering at ~66 chars/sec.
 *
 * Rate limiting: the upstream demi-api endpoint enforces 5 messages per
 * IP per UTC day. We forward the client's IP via X-Forwarded-For so the
 * upstream counter is keyed on the real visitor, not the Worker.
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
const MAX_MESSAGE_CHARS = 4_000;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }
  const message =
    (body as { message?: unknown } | null)?.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return jsonError('message must be a non-empty string', 400);
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return jsonError('message too long', 400);
  }

  const token = (cfEnv as Record<string, string | undefined>).WC_DEMO_TOKEN;
  if (!token) {
    return jsonError('demo_not_configured', 503);
  }
  const upstream =
    (cfEnv as Record<string, string | undefined>).WC_DEMO_UPSTREAM ??
    DEFAULT_UPSTREAM;

  // Forward client IP so the upstream rate limiter counts the visitor,
  // not the Worker. Cloudflare gives us the real IP in CF-Connecting-IP.
  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    '0.0.0.0';

  const wantsSse = (request.headers.get('accept') ?? '').includes(
    'text/event-stream',
  );

  const upstreamReq = new Request(`${upstream}/api/v1/wc-demo`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: wantsSse ? 'text/event-stream' : 'application/json',
      'x-wc-demo-token': token,
      'cf-connecting-ip': clientIp,
      'x-forwarded-for': clientIp,
    },
    body: JSON.stringify({ message }),
  });

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamReq);
  } catch (e) {
    return jsonError('upstream_unreachable', 502);
  }

  // For SSE, pass through the body stream as-is.
  if (wantsSse && upstreamRes.body) {
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  }

  // JSON path: forward status + body verbatim.
  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: { 'content-type': 'application/json' },
  });
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
