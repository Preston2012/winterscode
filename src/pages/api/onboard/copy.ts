/**
 * GET /api/onboard/copy?id=<id>&token=<token> : the contractor's own copy of
 * what they sent, as the same PDF Preston gets.
 *
 * Only the browser that sent the form holds the token, and the copy is served
 * for a day after sending, then the link stops working. The PDF holds the
 * answers alone, never the uploaded files.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { keyOf, readJson, sameToken, validId, type OnboardEnv, type State } from '../../../lib/onboard-store';

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ url }) => {
  const env = cfEnv as OnboardEnv;
  const id = url.searchParams.get('id');
  if (!env.LEADS || !validId(id)) return notFound();
  const state = await readJson<State>(env.LEADS, keyOf.state(id));
  if (!state || !state.finishedAt || !sameToken(url.searchParams.get('token') ?? '', state.token)) return notFound();
  if (Date.now() > Date.parse(state.createdAt) + DAY_MS) return notFound();
  const obj = await env.LEADS.get(keyOf.pdf(id));
  if (!obj || !obj.body) return notFound();
  return new Response(obj.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="chere-onboarding.pdf"',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
};
