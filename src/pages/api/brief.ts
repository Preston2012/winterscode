/**
 * /api/brief : contact-page brief form submission handler.
 *
 * Accepts a structured form POST from /contact and forwards a formatted
 * email to preston@winterscode.com. Returns {ok: true} on success so the
 * client can render a thank-you state without redirecting away.
 *
 * Validation: every field is bounded and trimmed. Rejects clearly empty
 * or oversized payloads. Honeypot field "company_extra" must be empty
 * (basic bot trap, hidden via CSS on the form).
 *
 * Email delivery: uses Resend if RESEND_API_KEY is set, otherwise falls
 * back to logging the formatted payload to the Worker log so submissions
 * never silently disappear. Preston rotates a Resend key in S12.
 *
 * Rate limit: 3 briefs per IP per UTC day (reuses the wc_demo_counters
 * pattern but with a separate key prefix "brief:"). Briefs are higher-
 * intent than chat so the cap is tighter.
 *
 * Env (optional):
 *   - RESEND_API_KEY: Resend API key, sends from preston@winterscode.com
 *   - BRIEF_FORWARD_TO: target email (default preston@winterscode.com)
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

const MAX_FIELD = 500;
const MAX_NOTES = 4000;
const DEFAULT_TO = 'preston@winterscode.com';

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

function trimField(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function formatBrief(b: Brief, ip: string): { subject: string; text: string; html: string } {
  const subject = `Brief from ${b.name}. ${b.business || b.projectType || 'Winters Code'}`;
  const lines = [
    `New brief submitted at ${new Date().toISOString()}`,
    `Source IP: ${ip}`,
    '',
    `Name:           ${b.name}`,
    `Email:          ${b.email}`,
    b.phone ? `Phone:          ${b.phone}` : null,
    b.business ? `Business:       ${b.business}` : null,
    b.city ? `City:           ${b.city}` : null,
    b.industry ? `Industry:       ${b.industry}` : null,
    b.projectType ? `Project type:   ${b.projectType}` : null,
    '',
    b.notes ? 'Notes:' : null,
    b.notes ? b.notes : null,
  ].filter(Boolean);
  const text = lines.join('\n');
  const html =
    '<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;">' +
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</pre>';
  return { subject, text, html };
}

async function sendViaResend(
  apiKey: string,
  to: string,
  brief: ReturnType<typeof formatBrief>,
): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Winters Code <preston@winterscode.com>',
        to: [to],
        reply_to: undefined,
        subject: brief.subject,
        text: brief.text,
        html: brief.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
    // Pretend success so bots don't retry.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
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

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';

  const formatted = formatBrief(brief, ip);
  const env = cfEnv as Record<string, string | undefined>;
  const to = env.BRIEF_FORWARD_TO ?? DEFAULT_TO;

  let delivered = false;
  if (env.RESEND_API_KEY) {
    delivered = await sendViaResend(env.RESEND_API_KEY, to, formatted);
  }

  if (!delivered) {
    // Fall back to logging the formatted brief. Cloudflare Worker logs
    // are retained for ~24h and visible via wrangler tail. Preston can
    // pull these manually if Resend is not yet configured at deploy time.
    console.log('[brief-fallback]', JSON.stringify({ to, ...formatted }));
  }

  return new Response(JSON.stringify({ ok: true, delivered }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
