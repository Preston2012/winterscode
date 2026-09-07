/**
 * /api/ingest : durable lead capture for Winters Code sites that are not on
 * Cloudflare, so email is never the only copy of a lead.
 *
 * WHY THIS EXISTS: the Sogn site runs on Vercel with no store of its own. Its
 * handler mailed the lead and told the visitor it worked whether or not the
 * send succeeded, so a delivery failure lost the message with no record and no
 * way to audit what never arrived. Cloudflare-hosted sites already capture
 * first and notify second. This gives the same guarantee to the ones that
 * cannot, by writing into the same R2 bucket under a per-site prefix.
 *
 * AUTHENTICATION: a shared secret in x-wc-ingest. It is compared in constant
 * time so the endpoint cannot be used as an oracle to recover the token one
 * byte at a time. Without a valid secret the route is a flat 401 that does no
 * work and touches no storage.
 *
 * This route notifies nobody. Capture and notification are separate jobs, and
 * the calling site still sends its own mail. The point of this endpoint is
 * that the lead survives when that mail does not.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { checkDayLimit, limitHeaders } from '../../lib/ratelimit';

const MAX_BODY = 20_000;
const INGESTS_PER_DAY = 60;
/** Sites allowed to write here. An unknown site is a misconfiguration or an
 *  abuse attempt, and either way it should stop rather than create a prefix. */
const SITES = new Set(['sogn', 'winterscode', 'test']);

interface R2Like {
  put(key: string, value: string, opts?: unknown): Promise<unknown>;
}

/** Length-independent comparison. Both sides are hashed to a fixed width first
 *  so the loop below cannot leak the secret's length either. */
async function secretMatches(offered: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(offered)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as { LEADS?: R2Like; INGEST_TOKEN?: string };

  const expected = env.INGEST_TOKEN ?? '';
  const offered = request.headers.get('x-wc-ingest') ?? '';
  if (!expected || !offered || !(await secretMatches(offered, expected))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const rl = await checkDayLimit({
    request,
    limit: INGESTS_PER_DAY,
    prefix: 'wc-ingest-rl',
  });
  if (!rl.allowed) {
    return json({ ok: false, error: 'rate_limit_exceeded' }, 429,
      limitHeaders(INGESTS_PER_DAY, rl));
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const site = typeof body.site === 'string' ? body.site.trim() : '';
  if (!SITES.has(site)) return json({ ok: false, error: 'unknown_site' }, 400);

  if (!env.LEADS) {
    console.error('[ingest] LEADS bucket not bound, lead not captured');
    return json({ ok: false, error: 'store_unavailable' }, 503);
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rand = (crypto.randomUUID?.() ?? `${Math.random()}`).replace(/-/g, '').slice(0, 8);
  const key = `leads/${site}/${ts}-${rand}.json`;

  const record = {
    receivedAt: now.toISOString(),
    site,
    sourceIp: request.headers.get('cf-connecting-ip') ?? '',
    lead: body.lead ?? body,
  };

  try {
    await env.LEADS.put(key, JSON.stringify(record, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('[ingest] R2 put failed', String(err).slice(0, 200));
    return json({ ok: false, error: 'store_failed' }, 502);
  }

  console.log('[ingest-stored]', key);
  return json({ ok: true, key }, 200);
};
