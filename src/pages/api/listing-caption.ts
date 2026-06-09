/**
 * /api/listing-caption : caption writer for the Listing Studio demo (/davis).
 *
 * Same pattern as /api/chat. The browser POSTs structured listing fields.
 * This route builds the caption prompt server-side and forwards it to
 * demi-api at demi.baseline.marketing/api/v1/wc-demo using WC_DEMO_TOKEN,
 * which lives in the Cloudflare env and never reaches the browser. The
 * client IP is forwarded so the upstream 5/IP/day limit keys on the visitor.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
// @ts-ignore : virtual module from @astrojs/cloudflare adapter
import { env as cfEnv } from 'cloudflare:workers';

const UPSTREAM = 'https://demi.baseline.marketing/api/v1/wc-demo';

const TONE: Record<string, string> = {
  warm: 'Warm and local. Neighborly and grounded, the way an agent talks to people who know the area. First person is welcome.',
  polished: 'Polished and professional. Clean, confident, no slang.',
  punchy: 'Punchy and high energy. Short lines, line breaks, momentum. At most one emoji, only if it fits.',
  luxury: 'Refined and understated. Evocative and unhurried, a little editorial. No hype words.',
};
const ANGLES = [
  'Lead with the light and the setting.',
  'Lead with the character of the home.',
  'Lead with what it feels like to arrive.',
  'Lead with the coast and the location.',
];
const STATUS_LABEL: Record<string, string> = {
  'just-listed': 'Just listed', 'open-house': 'Open house', 'price-improved': 'Price improved',
  'coming-soon': 'Coming soon', 'just-sold': 'Just sold',
};
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return j({ error: 'invalid_json' }, 400); }

  const token = (cfEnv as Record<string, string | undefined>).WC_DEMO_TOKEN;
  if (!token) return j({ error: 'not_configured' }, 503);

  const tone = TONE[b?.tone] ? b.tone : 'warm';
  const n = Number.isInteger(b?.n) ? Math.abs(b.n) : 0;
  const feats = Array.isArray(b?.features)
    ? b.features.map((x: unknown) => clip(x, 80)).filter(Boolean).slice(0, 4)
    : [];
  const f = {
    status: STATUS_LABEL[b?.status] || 'Just listed',
    price: clip(b?.price, 40), beds: clip(b?.beds, 10), baths: clip(b?.baths, 10),
    sqft: clip(b?.sqft, 20), address: clip(b?.address, 160),
    agent: clip(b?.agent, 80), phone: clip(b?.phone, 40),
    brokerage: clip(b?.brokerage, 120) || 'David L. Davis Real Estate',
  };

  const prompt = `You are a top real estate copywriter writing one social media caption for a brokerage on the southern Oregon coast. Write a single caption, ready to post.

Voice: ${TONE[tone]}

Write it well:
- Open with something specific and sensory about THIS home or its Oregon coast setting. Never use generic openers like "Welcome home", "Just listed", "Your dream home awaits", "Don't miss out", or "This one won't last".
- Work the facts in naturally. Do not just list them.
- Describe the property and the location only. Do not describe or imply the kind of person or household who would live there. Do not mention or hint at family status, children, religion, race, national origin, disability, sex, or age, and avoid coded phrases like "family friendly", "safe", "exclusive", "great for kids", or "walk to church". This is a legal requirement for housing ads.
- Close with a natural call to action plus the agent and brokerage name.
- Add 3 to 6 relevant hashtags about the place and real estate.
- Keep it tight and real. No corporate filler, no clichés.
- ${ANGLES[n % ANGLES.length]}
- Return only the caption text. No preamble, no quotation marks, no notes.

Listing:
- Status: ${f.status}
- Price: ${f.price}
- Beds: ${f.beds}
- Baths: ${f.baths}
- Square feet: ${f.sqft}
- Address or area: ${f.address}
- Highlights: ${feats.length ? feats.join('; ') : 'none provided'}
- Agent: ${f.agent}
- Phone: ${f.phone}
- Brokerage: ${f.brokerage}
- Market: Bandon and the southern Oregon coast`;

  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ?? '0.0.0.0';

  let up: Response;
  try {
    up = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'x-wc-demo-token': token, 'cf-connecting-ip': clientIp, 'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ message: prompt }),
    });
  } catch { return j({ error: 'upstream_unreachable' }, 502); }

  if (up.status === 429) return j({ error: 'rate_limited' }, 429);
  if (!up.ok) return j({ error: 'upstream_error' }, 502);

  let data: any;
  try { data = await up.json(); } catch { return j({ error: 'bad_upstream' }, 502); }
  const caption = (data?.content || '').trim();
  if (!caption) return j({ error: 'empty' }, 502);
  return j({ caption });
};

function j(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
}
