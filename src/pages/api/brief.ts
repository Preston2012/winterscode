/**
 * /api/brief : contact-page brief form submission handler.
 *
 * Captures each submission as a JSON object in the LEADS R2 bucket
 * (binding declared in the root wrangler.jsonc, bucket "winterscode-leads").
 * winterscode.com has no transactional-email provider by design, so the
 * durable store IS the delivery: the lead is safe the moment it is written,
 * and Preston reads new leads from the VPS (R2 is readable there with the
 * account R2 credentials, plus a cron mirrors new ones into a flat file).
 *
 * Returns {ok:true} once the lead is stored so the client renders the
 * thank-you state. If the store fails, returns {ok:false} so the form shows
 * the direct-contact fallback instead of a false thank-you.
 *
 * SCREENING, in cost order so junk never buys an upstream call:
 *   1. Per-IP daily rate limit, shared with /api/audit (lib/ratelimit).
 *   2. Honeypot field "company_extra", hidden via CSS on the form.
 *   3. Field validation, every field bounded and trimmed.
 *   4. Cloudflare Turnstile, verified server side (lib/turnstile).
 *
 * TURNSTILE FAILURE POLICY. A token the client did not supply or that
 * Cloudflare rejected is a refusal: 403, nothing stored. A secret that is
 * unbound, is one of Cloudflare's test secrets, or a siteverify call that
 * could not be reached is a SERVER problem, and a server problem must never
 * cost Preston a real lead. Those cases store the brief and record the
 * degraded state on the record. Every stored lead carries a "guard" field
 * naming how it was screened, so an unprotected window is visible in the
 * bucket afterward rather than invisible forever.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { checkDayLimit, limitHeaders } from '../../lib/ratelimit';
import { verifyTurnstile, isClientFailure } from '../../lib/turnstile';
import { notifyLead } from '../../lib/notify';

const MAX_FIELD = 500;
const MAX_NOTES = 4000;
const BRIEFS_PER_DAY = 5;

interface Brief {
  name: string;
  email: string;
  phone?: string;
  business?: string;
  city?: string;
  industry?: string;
  projectType?: string;
  notes?: string;
}

interface R2Like {
  put(key: string, value: string, opts?: unknown): Promise<unknown>;
}

function trimField(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Sortable, filesystem-safe key: leads/20260607T191000Z-ab12cd34.json
function leadKey(now: Date): string {
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rand = (crypto.randomUUID?.() ?? `${Math.random()}`).replace(/-/g, '').slice(0, 8);
  return `leads/${ts}-${rand}.json`;
}

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as {
    LEADS?: R2Like;
    TURNSTILE_SECRET_KEY?: string;
    WC_AUDIT_BYPASS?: string;
    NOTIFY?: { send(message: unknown): Promise<void> };
  };

  // 1. Rate limit before parsing so a flood never buys any work.
  const rl = await checkDayLimit({
    request,
    limit: BRIEFS_PER_DAY,
    prefix: 'wc-brief-rl',
    bypassSecret: env.WC_AUDIT_BYPASS,
  });
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'rate_limit_exceeded',
        message:
          'That is several briefs from this connection today. Text me at 541-551-0731 or email preston@winterscode.com and I will pick it up directly.',
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', ...limitHeaders(BRIEFS_PER_DAY, rl) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('invalid_json', 400);
  }

  // 2. Honeypot. bots usually fill every field including hidden ones.
  if (typeof body.company_extra === 'string' && body.company_extra.trim().length > 0) {
    return jsonOk();
  }

  // 3. Field validation.
  const brief: Brief = {
    name: trimField(body.name, MAX_FIELD),
    email: trimField(body.email, MAX_FIELD),
    phone: trimField(body.phone, MAX_FIELD) || undefined,
    business: trimField(body.business, MAX_FIELD) || undefined,
    city: trimField(body.city, MAX_FIELD) || undefined,
    industry: trimField(body.industry, MAX_FIELD) || undefined,
    projectType: trimField(body.projectType, MAX_FIELD) || undefined,
    notes: trimField(body.notes, MAX_NOTES) || undefined,
  };

  if (!brief.name || brief.name.length < 2) return jsonError('name required', 400);
  if (!brief.email || !isEmail(brief.email)) return jsonError('valid email required', 400);

  const now = new Date();
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';
  const country = request.headers.get('cf-ipcountry') ?? '';
  const referer = request.headers.get('referer') ?? '';

  // 4. Turnstile, last because it is the only step that costs a network call.
  const verdict = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET_KEY,
    token: body['cf-turnstile-response'],
    ip,
  });

  if (isClientFailure(verdict)) {
    console.log('[brief-refused]', verdict.state, ip);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'challenge_failed',
        message:
          'The browser check did not pass. Reload the page and try again, or text me at 541-551-0731.',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
  }

  if (verdict.state !== 'ok') {
    // Server-side degradation. Capture anyway and make the window loud.
    console.error('[brief-unguarded]', verdict.state, 'lead stored without a verified challenge');
  }

  const record = {
    receivedAt: now.toISOString(),
    ip,
    country,
    referer,
    guard: verdict.state,
    ...brief,
  };

  const key = leadKey(now);

  let stored = false;
  if (env.LEADS) {
    try {
      await env.LEADS.put(key, JSON.stringify(record, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });
      stored = true;
    } catch (err) {
      console.error('[brief] R2 put failed', String(err));
    }
  }

  if (!stored) {
    console.log('[brief-unstored]', JSON.stringify(record));
    return new Response(JSON.stringify({ ok: false, error: 'store_failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Notify second. The lead is already durable, so nothing below this line
  // may change the answer the visitor gets.
  const notified = await notifyLead(env, {
    ...brief,
    receivedAt: record.receivedAt,
    guard: verdict.state,
    key,
  });

  console.log('[brief-stored]', key, verdict.state, 'notify:' + notified);
  return jsonOk();
};

function jsonOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
