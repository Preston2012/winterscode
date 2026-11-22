// Run `astro build` under an allowlisted environment, so the build emits the
// same bytes whoever runs it.
//
// WHY. Astro 7 inlines into the server bundle every environment variable whose
// NAME appears in the source of a module that reads `import.meta.env` bare
// (astro/dist/env/vite-plugin-import-meta-env.js, getReferencedPrivateKeys).
// Its actions runtime is such a module, so the launcher path `_` and `PORT`
// landed in dist/server/entry.mjs. npm from a shell, golden.py's subprocess and
// a shell started by another tool each produced different bytes from one tree,
// and the golden moved with no source change (S429, 2026-11-18). The same path
// would bake any short-named secret in a builder's environment into the Worker
// bundle and its source map. Passing only what the build needs closes both.
//
// Add a name here only when the build reads it, and say which file reads it.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEEP = [
  // process basics: node, git (astro.config.mjs runs git log), temp files, locale
  'PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'NODE_OPTIONS',
  // TLS and proxy, for the build-time fetch in src/pages/wall.astro
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  // src/layouts/BaseLayout.astro reads CF_PAGES_BRANCH to noindex Pages previews
  'CF_PAGES', 'CF_PAGES_BRANCH', 'CF_PAGES_COMMIT_SHA', 'CF_PAGES_URL',
  // A public host name, not a secret: the preview build's share-card origin.
  'WC_OG_ORIGIN',
]

// Fixed values only: a constant cannot make two builders differ.
const env = { ASTRO_TELEMETRY_DISABLED: '1' }
for (const k of KEEP) if (process.env[k] !== undefined) env[k] = process.env[k]

// fileURLToPath, not .pathname: .pathname keeps percent-encoding (a space reads as %20), so a
// checkout path with a space or a non-ASCII character would not resolve (Codex P2 on #42).
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const astro = realpathSync(join(ROOT, 'node_modules', '.bin', 'astro'))
const r = spawnSync(process.execPath, [astro, 'build', ...process.argv.slice(2)], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
})
if (r.error) {
  console.error('[astro-build] ' + r.error.message)
  process.exit(1)
}
process.exit(r.status ?? 1)
