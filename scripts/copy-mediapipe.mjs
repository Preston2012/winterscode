// Copy the MediaPipe vision wasm runtime into public/journey/mp for /journey's
// opt-in head tracking. Copied at build, not committed: four files, 26MB, and
// the version is whatever package-lock pins. The page fetches them only after
// a visitor taps "Look through the window".
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'node_modules/@mediapipe/tasks-vision/wasm')
const OUT = join(ROOT, 'public/journey/mp')
const FILES = [
  'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm',
]
await mkdir(OUT, { recursive: true })
for (const f of FILES) await copyFile(join(SRC, f), join(OUT, f))
console.log(`copy-mediapipe: ${FILES.length} files to public/journey/mp`)
