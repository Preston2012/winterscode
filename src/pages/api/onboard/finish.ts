/**
 * POST /api/onboard/finish : close a submission, write its PDF, tell Preston.
 *
 * Body (JSON): { id, token }. Reads the stored answers, looks up each declared
 * file in the bucket (a file that never arrived is named in the PDF and the
 * mail, never passed over), writes onboarding.pdf beside them, sends the
 * notice with the PDF attached, and marks the submission finished. A second
 * call answers ok and sends nothing, so a retry after a dropped connection
 * cannot mail Preston twice.
 *
 * It also returns the PDF's path for the page's "Save a copy" link, which
 * /api/onboard/copy serves to the holder of the same token.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import type { Answers, DeclaredFile } from '../../../lib/onboard-spec';
import { buildPdf } from '../../../lib/onboard-pdf';
import {
  json, keyOf, onboardMime, pdfBlocks, readJson, sameToken, sendOnboardMail, validId,
  type FileLine, type OnboardEnv, type State,
} from '../../../lib/onboard-store';

export const POST: APIRoute = async ({ request }) => {
  const env = cfEnv as OnboardEnv;
  if (!env.LEADS) return json({ ok: false, error: 'store_failed' }, 502);

  let body: { id?: unknown; token?: unknown };
  try { body = JSON.parse((await request.text()).slice(0, 2048)); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  const id = body.id;
  if (!validId(id)) return json({ ok: false, error: 'bad_request' }, 400);

  const state = await readJson<State>(env.LEADS, keyOf.state(id));
  if (!state || !sameToken(String(body.token ?? ''), state.token)) return json({ ok: false, error: 'not_found' }, 404);
  if (state.finishedAt) return json({ ok: true, id, already: true });

  const record = await readJson<{ receivedAt: string; answers: Answers; files: DeclaredFile[] }>(env.LEADS, keyOf.answers(id));
  if (!record) return json({ ok: false, error: 'not_found' }, 404);

  const files: FileLine[] = [];
  for (let n = 0; n < state.files.length; n++) {
    const f = state.files[n];
    const key = keyOf.file(id, n, f.name);
    const head = await env.LEADS.head(key);
    files.push({ field: f.field, name: f.name, size: f.size, key, stored: !!head && head.size === f.size });
  }

  const received = new Date(record.receivedAt);
  const pdf = buildPdf(pdfBlocks(record.answers, files, { id, received }), {
    title: `Chere' onboarding: ${String(record.answers.legal_name ?? '')}`,
    created: received,
  });
  try {
    await env.LEADS.put(keyOf.pdf(id), pdf, { httpMetadata: { contentType: 'application/pdf' } });
  } catch (err) {
    console.error('[onboard-finish] pdf put failed', id, String(err).slice(0, 200));
  }

  const notify = await sendOnboardMail(env, onboardMime(record.answers, files, pdf, { id, received }));
  const done: State = { ...state, finishedAt: new Date().toISOString(), notify };
  try {
    await env.LEADS.put(keyOf.state(id), JSON.stringify(done), { httpMetadata: { contentType: 'application/json' } });
  } catch (err) {
    console.error('[onboard-finish] state put failed', id, String(err).slice(0, 200));
  }

  const missing = files.filter((f) => !f.stored).map((f) => f.name);
  console.log('[onboard-finished]', id, `notify:${notify}`, `files:${files.length - missing.length}/${files.length}`);
  return json({ ok: true, id, missing });
};
