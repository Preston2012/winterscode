/**
 * POST /api/onboard/start : the Chere' onboarding answers, checked and stored.
 *
 * Body (JSON): { answers, files: [{field, name, type, size}], company_extra,
 * 'cf-turnstile-response' }. Answers are checked against the one question
 * spec (lib/onboard-spec), the same checks the page ran. On success it
 * stores answers.json and state.json and returns { ok, id, token, uploads }:
 * where each declared file goes. The browser then sends each file to
 * /api/onboard/upload and calls /api/onboard/finish.
 *
 * SCREENING, cheapest first, as /api/brief: a per-IP daily limit, a honeypot,
 * the spec's checks, then Turnstile. A missing or rejected token refuses; a
 * server-side Turnstile problem stores anyway and records the guard state, so
 * a broken check never costs Preston a contractor's answers.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { checkDayLimit, limitHeaders } from '../../../lib/ratelimit';
import { verifyTurnstile, isClientFailure } from '../../../lib/turnstile';
import { checkSubmission } from '../../../lib/onboard-spec';
import { UPLOAD_WINDOW_MS, hex, json, keyOf, newId, type OnboardEnv, type State } from '../../../lib/onboard-store';

const PER_DAY = 3;
const MAX_BODY = 64 * 1024;
const CONTACT = 'Text me at 541-551-0731 or email preston@winterscode.com and we will do it together.';

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as OnboardEnv;

  const rl = await checkDayLimit({ request, limit: PER_DAY, prefix: 'wc-onboard-rl', bypassSecret: env.WC_AUDIT_BYPASS });
  if (!rl.allowed) {
    return json({ ok: false, error: 'rate_limit_exceeded', message: `That is several sends from this connection today. ${CONTACT}` }, 429, limitHeaders(PER_DAY, rl));
  }

  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  // Honeypot: answer as if it worked, store nothing.
  if (typeof body.company_extra === 'string' && body.company_extra.trim() !== '') {
    return json({ ok: true, id: 'x', token: 'x', uploads: [] });
  }

  const checked = checkSubmission(body.answers, body.files);
  if (!checked.ok) return json({ ok: false, error: 'check_failed', errors: checked.errors }, 400);

  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const verdict = await verifyTurnstile({ secret: env.TURNSTILE_SECRET_KEY, token: body['cf-turnstile-response'], ip });
  if (isClientFailure(verdict)) {
    console.log('[onboard-refused]', verdict.state, ip);
    return json({ ok: false, error: 'challenge_failed', message: `The browser check did not pass. Reload the page and try again. ${CONTACT}` }, 403);
  }
  if (verdict.state !== 'ok') console.error('[onboard-unguarded]', verdict.state, 'stored without a verified challenge');

  if (!env.LEADS) return json({ ok: false, error: 'store_failed' }, 502);

  const now = new Date();
  const id = newId(now);
  const token = hex(16);
  const state: State = {
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + UPLOAD_WINDOW_MS).toISOString(),
    files: checked.files,
  };
  const record = {
    receivedAt: now.toISOString(),
    ip,
    country: request.headers.get('cf-ipcountry') ?? '',
    guard: verdict.state,
    answers: checked.answers,
    files: checked.files,
  };
  try {
    await env.LEADS.put(keyOf.answers(id), JSON.stringify(record, null, 2), { httpMetadata: { contentType: 'application/json' } });
    await env.LEADS.put(keyOf.state(id), JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });
  } catch (err) {
    console.error('[onboard] store failed', String(err).slice(0, 200));
    return json({ ok: false, error: 'store_failed' }, 502);
  }

  console.log('[onboard-started]', id, verdict.state, `files:${checked.files.length}`);
  return json({ ok: true, id, token, uploads: checked.files.map((f, n) => ({ n, field: f.field, name: f.name })) });
};
