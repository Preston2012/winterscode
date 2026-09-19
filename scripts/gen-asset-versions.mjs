// Content-hash every file under public/work and write the map the site imports.
//
// WHY. The board swap on 2026-09-19 reused the same four filenames, so the
// bytes changed and the URL did not. Cloudflare was purgeable, but every
// visitor who had already loaded the old board kept it, because a browser with
// a fresh copy under that URL never asks again. A content hash in the query
// makes a changed file a changed URL, which is the only cache invalidation
// that reaches a browser you do not control.
//
// WHY A GENERATED JSON AND NOT A HASH AT RENDER TIME. winterscode deploys as a
// Worker. A helper that reads the filesystem is fine in a prerendered page and
// a crash in anything that ends up server-rendered, and the difference is not
// visible at the call site. A JSON map is inert: it cannot reach for node:fs
// no matter which runtime imports it.
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIRS = ['public/work']
const OUT = join(ROOT, 'src/asset-versions.json')

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const versions = {}
for (const d of DIRS) {
  for (const file of await walk(join(ROOT, d))) {
    const url = '/' + relative(join(ROOT, 'public'), file)
    versions[url] = createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 8)
  }
}
const sorted = Object.fromEntries(Object.keys(versions).sort().map((k) => [k, versions[k]]))
await writeFile(OUT, JSON.stringify(sorted, null, 1) + '\n')
console.log(`[asset-versions] hashed ${Object.keys(sorted).length} file(s) -> src/asset-versions.json`)
