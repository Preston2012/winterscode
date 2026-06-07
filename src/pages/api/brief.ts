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
 * Validation: every field is bounded and trimmed. Honeypot field
 * "company_extra" must be empty (hidden via CSS on the form).
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

const MAX_FIELD = 500;
const MAX_NOTES = 4000;

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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError('invalid_json', 400);
  }

  // Honeypot. bots usually fill every field including hidden ones.
  if (typeof body.company_extra === 'string' && body.company_extra.trim().length > 0) {
    return jsonOk();
  }

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

  const record = {
    receivedAt: now.toISOString(),
    ip,
    country,
    referer,
    ...brief,
  };

  const env = cfEnv as { LEADS?: R2Like };
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

  console.log('[brief-stored]', key);
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
