/**
 * The external hosts winterscode.com is allowed to load scripts from.
 *
 * ONE DEFINITION, TWO CONSUMERS. astro.config.mjs feeds this to Astro's
 * security.csp scriptDirective so every page's meta CSP carries the hosts,
 * and scripts/csp-postprocess.mjs reads the same list when it appends inline
 * script hashes, so the postprocess can never drop a host the config added.
 * Two hardcoded copies of an allowlist is how a working page starts failing
 * after an unrelated build change.
 *
 * Adding a host here is admitting third-party code to the page. It is a trust
 * decision, not a formatting one.
 */

/** Cloudflare Web Analytics beacon, injected at the edge on every response. */
export const CF_INSIGHTS = 'https://static.cloudflareinsights.com';

/**
 * Cloudflare Turnstile. The /contact brief form loads the challenge script
 * from here. Without this host in script-src the widget never renders, the
 * form never receives a token, and /api/brief refuses every submission: the
 * bot control becomes an outage. Verified against the built HTML, not assumed
 * from this comment.
 */
export const TURNSTILE = 'https://challenges.cloudflare.com';

/** Script hosts, in the order they appear in the emitted directive. */
export const SCRIPT_HOSTS = [CF_INSIGHTS, TURNSTILE];
