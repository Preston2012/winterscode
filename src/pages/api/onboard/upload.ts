/**
 * PUT /api/onboard/upload?id=<id>&n=<n> : one onboarding file, as the raw body.
 *
 * The header x-onboard-token carries the key /api/onboard/start returned.
 * The file must be one the answers declared, at the declared size, inside the
 * upload window, and not already stored. The body goes to R2 as a stream: the
 * Worker never reads its bytes (the free plan's 10 ms of CPU could not carry
 * a megabyte through JavaScript, see lib/onboard-store).
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { json, keyOf, readJson, sameToken, validId, type OnboardEnv, type State } from '../../../lib/onboard-store';

export const PUT: APIRoute = async ({ request, url }) => {
  const env = cfEnv as OnboardEnv;
  if (!env.LEADS) return json({ ok: false, error: 'store_failed' }, 502);

  const id = url.searchParams.get('id');
  const n = Number(url.searchParams.get('n'));
  if (!validId(id) || !Number.isInteger(n) || n < 0) return json({ ok: false, error: 'bad_request' }, 400);

  const state = await readJson<State>(env.LEADS, keyOf.state(id));
  if (!state || !sameToken(request.headers.get('x-onboard-token') ?? '', state.token)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }
  if (state.finishedAt || Date.now() > Date.parse(state.expiresAt)) {
    return json({ ok: false, error: 'closed', message: 'This form has already been sent. Text me the file and I will add it.' }, 409);
  }
  const file = state.files[n];
  if (!file) return json({ ok: false, error: 'not_declared' }, 400);

  const len = Number(request.headers.get('content-length') ?? '-1');
  if (!request.body || len !== file.size) {
    return json({ ok: false, error: 'size_mismatch', message: `${file.name} did not arrive whole. Try again.` }, 400);
  }

  const key = keyOf.file(id, n, file.name);
  if (await env.LEADS.head(key)) return json({ ok: true, n, already: true });

  try {
    await env.LEADS.put(key, request.body, {
      httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${key.split('/').pop()}"` },
      customMetadata: { field: file.field, name: file.name.slice(0, 160) },
    });
  } catch (err) {
    console.error('[onboard-upload] put failed', id, n, String(err).slice(0, 200));
    return json({ ok: false, error: 'store_failed', message: `${file.name} did not save. Try again.` }, 502);
  }
  return json({ ok: true, n });
};
