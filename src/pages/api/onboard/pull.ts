/**
 * GET /api/onboard/pull : token-protected read of onboarding submissions, for
 * wc-onboard-pull.py on the ops host. Same bearer token and same 404 for a
 * wrong one as /api/leads: the submissions are a contractor's business
 * records, so the route does not advertise itself.
 *
 *   ?list=1          every submission: id, business, finished, its files
 *   ?key=onboard/... one stored object, streamed as it was stored
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';
import { json, type OnboardEnv } from '../../../lib/onboard-store';

const KEY = /^onboard\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}\/[\w.\-/]+$/;

export const GET: APIRoute = async ({ request, url }) => {
  const env = cfEnv as OnboardEnv;
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.LEADS_READ_TOKEN ?? ''}`;
  if (!env.LEADS_READ_TOKEN || auth.length !== expected.length || auth !== expected) {
    return new Response('Not found', { status: 404 });
  }
  if (!env.LEADS) return json({ error: 'no_store' }, 500);

  const key = url.searchParams.get('key');
  if (key !== null) {
    if (!KEY.test(key) || key.includes('..')) return json({ error: 'bad_key' }, 400);
    const obj = await env.LEADS.get(key);
    if (!obj || !obj.body) return new Response('Not found', { status: 404 });
    return new Response(obj.body, {
      headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }

  const objects: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const listed = await env.LEADS.list({ prefix: 'onboard/', limit: 1000, cursor });
    objects.push(...listed.objects.map((o) => ({ key: o.key, size: o.size })));
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  const byId = new Map<string, { id: string; objects: { key: string; size: number }[] }>();
  for (const o of objects) {
    const id = o.key.split('/')[1];
    if (!byId.has(id)) byId.set(id, { id, objects: [] });
    byId.get(id)!.objects.push(o);
  }
  const submissions = [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
  return json({ count: submissions.length, submissions });
};
