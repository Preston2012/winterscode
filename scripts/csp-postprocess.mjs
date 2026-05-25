#!/usr/bin/env node
/**
 * CSP post-processor.
 *
 * After Astro build, every prerendered HTML page contains a
 * <meta http-equiv="content-security-policy" content="..."> tag with hashes for
 * scripts/styles Astro's CSP system tracks (Vite chunks, integration scripts).
 *
 * Inline <script> blocks written directly in .astro component bodies are NOT
 * tracked. They get blocked by the strict CSP that has no 'unsafe-inline'.
 *
 * This script walks dist/client/**.html, finds every executable inline
 * script per page, computes its SHA-256 hash, and appends the hashes into
 * the existing meta CSP tag's script-src directive.
 *
 * Result: a strict CSP per page with exact hashes for every script the page
 * actually contains. No 'unsafe-inline'. Lighthouse Best-Practices passes.
 *
 * SHA-256 is the algorithm Astro defaults to. Match it.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIST = process.argv[2] || 'dist/client';
const VERBOSE = process.env.CSP_VERBOSE === '1';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function cspHash(text) {
  const h = createHash('sha256').update(text, 'utf8').digest('base64');
  return `'sha256-${h}'`;
}

function processHtml(html, label) {
  const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  const hashes = new Set();
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const content = m[2];
    if (!content.trim()) continue;
    if (/\ssrc\s*=/.test(attrs)) continue;
    const typeMatch = /\stype\s*=\s*"([^"]+)"/.exec(attrs);
    if (typeMatch) {
      const t = typeMatch[1].toLowerCase();
      if (t !== 'module' && t !== 'text/javascript') continue;
    }
    hashes.add(cspHash(content));
  }

  if (hashes.size === 0) return html;

  const metaRe = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?\s*>/i;
  const meta = metaRe.exec(html);
  if (!meta) {
    if (VERBOSE) console.warn(`[csp] ${label}: no meta CSP, skipping`);
    return html;
  }

  let policy = meta[1];
  const directives = policy.split(/\s*;\s*/).filter(Boolean);
  let scriptIdx = directives.findIndex((d) => d.startsWith('script-src'));

  // Hashes + explicit host allowlist (no 'strict-dynamic'). This passes
  // Lighthouse csp-xss audit (the audit considers hashes or strict-dynamic
  // sufficient; either is fine). Allows the CF Web Analytics beacon Preston
  // keeps active for visitor data, while still blocking arbitrary XSS via
  // strict per-script hashes for everything inline.
  const CF_INSIGHTS = "https://static.cloudflareinsights.com";
  if (scriptIdx === -1) {
    directives.push(`script-src 'self' ${CF_INSIGHTS} ${[...hashes].join(' ')}`);
  } else {
    const existing = directives[scriptIdx];
    const missing = [...hashes].filter((h) => !existing.includes(h));
    if (missing.length > 0) {
      directives[scriptIdx] = `${existing} ${missing.join(' ')}`;
    }
    // Strip the older strict-dynamic + unsafe-inline approach if leftover.
    directives[scriptIdx] = directives[scriptIdx]
      .replace(/\s+'strict-dynamic'/g, '')
      .replace(/\s+'unsafe-inline'/g, '')
      .replace(/\s+https:(?=\s|;|$)/g, '');
    // Ensure CF Insights host is allowlisted (for the auto-injected beacon).
    if (!directives[scriptIdx].includes(CF_INSIGHTS)) {
      directives[scriptIdx] = directives[scriptIdx].replace(
        /^script-src\s+/,
        `script-src 'self' ${CF_INSIGHTS} `
      );
    }
    // Dedupe any repeated tokens. Walk, keep unique.
    {
      const tokens = directives[scriptIdx].split(/\s+/);
      const seen = new Set();
      directives[scriptIdx] = tokens.filter((t) => {
        if (!t) return false;
        if (t === 'script-src') return !seen.has(t) ? (seen.add(t), true) : false;
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      }).join(' ');
    }
  }

  // Strip SHA-256 hashes from style-src. When style-src contains both
  // 'unsafe-inline' AND any hash/nonce, CSP3 browsers IGNORE 'unsafe-inline'
  // for compat reasons. Result: every inline style="" attribute on the page
  // gets blocked because no hash matches. Drop the hashes so 'unsafe-inline'
  // takes effect for style only. We lose CSP coverage on stylesheets, but
  // for a content site the XSS surface is in scripts not styles.
  const styleIdx = directives.findIndex((d) => d.startsWith('style-src'));
  if (styleIdx !== -1) {
    directives[styleIdx] = directives[styleIdx].replace(/\s+'sha\d+-[A-Za-z0-9+/=]+'/g, '');
  }

  const newPolicy = directives.join('; ');
  const newMeta = `<meta http-equiv="content-security-policy" content="${newPolicy}">`;
  if (VERBOSE) {
    console.log(`[csp] ${label}: added ${hashes.size} hashes`);
  }
  return html.replace(meta[0], newMeta);
}

const files = htmlFiles(DIST);
let processed = 0;
let skipped = 0;
for (const f of files) {
  const orig = readFileSync(f, 'utf8');
  const next = processHtml(orig, f.replace(/^.*dist\/client\//, ''));
  if (next !== orig) {
    writeFileSync(f, next, 'utf8');
    processed++;
  } else {
    skipped++;
  }
}
console.log(`[csp] processed ${processed} HTML files, skipped ${skipped}`);
