/**
 * /api/leads : token-protected read of captured contact-form leads.
 *
 * The winterscode Worker has the LEADS R2 binding, so it can list and read
 * the stored briefs directly. This endpoint returns them as JSON for an
 * operator tool on the VPS to pull over HTTPS. Without the correct bearer
 * token it returns 404 (does not advertise its existence). Lead data is PII,
 * so the token (env.LEADS_READ_TOKEN, a Worker secret) must stay private.
 *
 * Query: ?limit=N (default 50, max 500). Newest first.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

interface R2Obj { text(): Promise<string> }
interface R2Like {
  list(opts?: { prefix?: string; limit?: number }): Promise<{ objects: { key: string }[] }>;
  get(key: string): Promise<R2Obj | null>;
}

export const GET: APIRoute = async ({ request, url }) => {
  const env = cfEnv as { LEADS?: R2Like; LEADS_READ_TOKEN?: string };

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.LEADS_READ_TOKEN ?? ''}`;
  // Reject (as 404) unless a token is configured and matches exactly.
  if (!env.LEADS_READ_TOKEN || auth.length !== expected.length || auth !== expected) {
    return new Response('Not found', { status: 404 });
  }
  if (!env.LEADS) {
    return new Response(JSON.stringify({ error: 'no_store' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 500);
  const listed = await env.LEADS.list({ prefix: 'leads/', limit: 1000 });
  const keys = listed.objects.map((o) => o.key).sort().reverse().slice(0, limit);

  const leads: unknown[] = [];
  for (const k of keys) {
    const obj = await env.LEADS.get(k);
    if (!obj) continue;
    try { leads.push({ key: k, ...JSON.parse(await obj.text()) }); } catch { /* skip */ }
  }

  return new Response(JSON.stringify({ count: leads.length, leads }, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
