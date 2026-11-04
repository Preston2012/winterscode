// Remove the local secrets file the Cloudflare Vite plugin copies into the build.
//
// WHY. @cloudflare/vite-plugin emits dist/server/.dev.vars, built from the repo's
// gitignored .dev.vars, so that `vite preview` can read it. This site never runs
// `vite preview` on built output: previews and production both deploy with
// wrangler, and production secrets live in Cloudflare. The copy is never
// uploaded (it is not a module, and .assetsignore keeps it out of the assets),
// but it puts a live token, readable by any user on the host, in a folder that
// gets listed, diffed, archived and compared by the golden gate. The build output
// has no use for it, so the build removes it and then checks that it is gone.
import { existsSync, rmSync } from 'node:fs'

const file = new URL('../dist/server/.dev.vars', import.meta.url)
if (existsSync(file)) rmSync(file)
if (existsSync(file)) {
  console.error('[strip-dev-vars] dist/server/.dev.vars is still present after removal')
  process.exit(1)
}
console.log('[strip-dev-vars] dist/server/.dev.vars absent')
