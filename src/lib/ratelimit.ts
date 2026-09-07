/**
 * Shared per-IP daily rate limiter for the winterscode API routes.
 *
 * WHY THIS IS SHARED: /api/audit grew a working limiter and /api/brief grew
 * none, so the site had one guarded endpoint and one open one. Two copies of
 * a control drift; one copy with two callers does not. Every route that takes
 * an unauthenticated POST calls this.
 *
 * MECHANISM: the Workers edge Cache API holds a counter per IP per UTC day
 * with a TTL that expires at midnight UTC. It is eventually consistent across
 * edge locations, so a determined abuser spraying many colos burns some budget
 * before the count converges. That is the accepted limit of this mechanism and
 * the reason it is a first line rather than the only one. Cloudflare DDoS
 * protection sits in front of it. Swap in a Durable Object or a Rate Limiting
 * binding when a route needs a hard count.
 *
 * FAIL OPEN: a cache read or write failure lets the request through. Blocking
 * an honest visitor because the counter was unavailable costs a real lead.
 */

export interface DayLimitVerdict {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  /** Present when a bypass secret matched, so callers can log the skip. */
  bypassed?: boolean;
}

export interface DayLimitOptions {
  request: Request;
  /** Requests allowed per IP per UTC day. */
  limit: number;
  /** Cache key namespace, one per route family. Example: wc-brief-rl. */
  prefix: string;
  /** Optional shared secret that skips the limit when the header matches. */
  bypassSecret?: string;
  /** Header carrying the bypass secret. Defaults to x-wc-bypass. */
  bypassHeader?: string;
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function endOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
  );
}

export async function checkDayLimit(opts: DayLimitOptions): Promise<DayLimitVerdict> {
  const { request, limit, prefix } = opts;
  const now = new Date();
  const tomorrow = endOfUtcDay(now);
  const resetAt = tomorrow.toISOString();

  const bypassHeader = opts.bypassHeader ?? 'x-wc-bypass';
  const offered = request.headers.get(bypassHeader) || '';
  if (opts.bypassSecret && offered && offered === opts.bypassSecret) {
    return { allowed: true, remaining: -1, resetAt: 'bypass', bypassed: true };
  }

  const ip = clientIp(request);
  const today = now.toISOString().slice(0, 10);
  // Synthetic cache URL. The Cache API needs a Request-like URL and this one
  // is never fetched.
  const cacheUrl = `https://rl.internal/${encodeURIComponent(`${prefix}:${ip}:${today}`)}`;

  let count = 0;
  try {
    // @ts-ignore : caches.default is a Workers runtime global
    const cache = caches.default;
    const hit = await cache.match(cacheUrl);
    if (hit) {
      const parsed = parseInt(await hit.text(), 10);
      if (Number.isFinite(parsed)) count = parsed;
    }
  } catch {
    // Fail open. See the header comment.
  }

  if (count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  const ttlSeconds = Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
  try {
    // @ts-ignore : caches.default is a Workers runtime global
    const cache = caches.default;
    await cache.put(
      cacheUrl,
      new Response(String(count + 1), {
        headers: {
          'cache-control': `max-age=${ttlSeconds}`,
          'content-type': 'text/plain',
        },
      }),
    );
  } catch {
    // Non-fatal. The count may drift; the request proceeds.
  }

  return { allowed: true, remaining: Math.max(0, limit - (count + 1)), resetAt };
}

/** Standard rate-limit headers for a refusal response. */
export function limitHeaders(limit: number, verdict: DayLimitVerdict): Record<string, string> {
  return {
    'retry-after': String(
      Math.max(1, Math.ceil((new Date(verdict.resetAt).getTime() - Date.now()) / 1000)),
    ),
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-remaining': String(Math.max(0, verdict.remaining)),
    'x-ratelimit-reset': verdict.resetAt,
  };
}
