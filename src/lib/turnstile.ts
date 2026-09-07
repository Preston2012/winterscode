/**
 * Cloudflare Turnstile server-side verification.
 *
 * WHY: a Turnstile widget on the page proves nothing. The token it produces is
 * a claim, and the claim is worth exactly as much as the siteverify call that
 * checks it. S195 found two client repos falling back to Cloudflare's
 * always-pass TEST sitekey when the real one was absent, on an account that
 * held zero widgets. A form can render a challenge, post a token, verify it
 * against the test secret, and pass every forged submission.
 *
 * So this module refuses to call a test pair a control. When the configured
 * secret is one of Cloudflare's documented test secrets the verdict is
 * test-pair, never ok, and the caller logs it as unprotected.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare's published testing secrets. None of these is a control. */
const TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

export type TurnstileVerdict =
  /** Verified against a real widget secret. */
  | { state: 'ok' }
  /** No secret bound to the Worker. The route has no bot control. */
  | { state: 'unconfigured' }
  /** A documented Cloudflare test secret is bound. Every token passes. */
  | { state: 'test-pair' }
  /** The client posted no token. */
  | { state: 'missing-token' }
  /** Cloudflare rejected the token. */
  | { state: 'rejected'; codes: string[] }
  /** siteverify could not be reached or returned nothing usable. */
  | { state: 'unreachable' };

export interface VerifyOptions {
  /** The TURNSTILE_SECRET_KEY binding value, or undefined when unbound. */
  secret: string | undefined;
  /** The cf-turnstile-response value the client posted. */
  token: unknown;
  /** Visitor IP, forwarded to siteverify when known. */
  ip?: string;
  /** Idempotency key, so one token can be re-checked without a spend error. */
  idempotencyKey?: string;
}

export async function verifyTurnstile(opts: VerifyOptions): Promise<TurnstileVerdict> {
  const secret = (opts.secret ?? '').trim();
  if (!secret) return { state: 'unconfigured' };
  if (TEST_SECRETS.has(secret)) return { state: 'test-pair' };

  const token = typeof opts.token === 'string' ? opts.token.trim() : '';
  if (!token) return { state: 'missing-token' };

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (opts.ip && opts.ip !== 'unknown' && opts.ip !== '0.0.0.0') {
    form.set('remoteip', opts.ip);
  }
  if (opts.idempotencyKey) form.set('idempotency_key', opts.idempotencyKey);

  let data: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    data = (await res.json()) as typeof data;
  } catch {
    return { state: 'unreachable' };
  }

  if (data?.success === true) return { state: 'ok' };
  return { state: 'rejected', codes: data?.['error-codes'] ?? [] };
}

/**
 * True when the verdict means the request carried no proven human signal AND
 * the absence is the client's doing rather than a server misconfiguration.
 * A misconfigured server must never cost a real lead, so unconfigured,
 * test-pair and unreachable are handled by the caller as degraded-but-capture,
 * not as a refusal.
 */
export function isClientFailure(v: TurnstileVerdict): boolean {
  return v.state === 'missing-token' || v.state === 'rejected';
}
