// Share cards, one per page. S339 round 3 (Preston 2026-11-21: "share cards
// need updated to be as good"). The old single card was set in a stand-in
// serif because the renderer never had the site's fonts.
//
// What it does: reads every page in dist/client after a build, takes the
// page's H1, sets it in the site's own Fraunces, Plex and JetBrains Mono on a
// riveted plate with the seal and the annealed copper, and writes
// public/og/<slug>.jpg at 1200x630 plus src/lib/og-cards.json, the list
// BaseLayout reads to point og:image at the page's own card.
//
// Run after `npm run build`, then build again so the cards ship:
//   PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chrome node scripts/cards/og-cards.mjs
// Playwright is not a dependency of this repo; any install works.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('../..', import.meta.url).pathname);
const dist = join(root, 'dist/client');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

// Pages whose copper phrase reads better chosen by hand than by the rule.
const COPPER = {
  '/': 'software.',
  '/about': 'Preston Winters.',
  '/chere': 'back office.',
  '/chere/join': 'your phone.',
  '/chere/privacy': 'in plain English.',
  '/chere/support': 'a text away.',
  '/chere/onboard': 'your business.',
  '/process': 'a live site you own.',
  '/audit': 'doing right',
  '/wall': 'live.',
  '/services/app-development': 'Both app stores.',
  '/services/ai-automation': 'not the buzzword kind.',
  '/faq': 'answered.',
  '/work/grand-management': '13 business days.',
};
const SKIP = new Set(['/404', '/lamp', '/media']);
// Noindex pages that still get sent by text: the Chere' setup link goes to every new customer.
const KEEP_NOINDEX = new Set(['/chere/onboard']);
// Chere' pages wear the app's own colors and icon on the same plate (S339 round 4b, Preston
// 2026-11-22: the blue card had "better branding", the plate cards read better).
const isChere = (path) => path === '/chere' || path.startsWith('/chere/');

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});
const decode = (s) => s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pages = [];
for (const file of walk(dist)) {
  const rel = '/' + relative(dist, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  const path = rel === '/' || rel === '' ? '/' : rel.replace(/\/$/, '');
  if (SKIP.has(path) || path.startsWith('/api')) continue;
  const html = readFileSync(file, 'utf8');
  if (/name="robots" content="[^"]*noindex/.test(html) && !KEEP_NOINDEX.has(path)) continue;
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) continue;
  const h1 = decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  pages.push({ path, slug: path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'), h1 });
}

// The copper phrase: a hand pick, else the second sentence, else the last word.
function split(path, h1) {
  let cu = COPPER[path];
  if (!cu) {
    const sentences = h1.match(/[^.!?]+[.!?]/g);
    const words = h1.split(' ');
    cu = sentences && sentences.length > 1 ? sentences[sentences.length - 1].trim() : words.slice(words.length > 2 ? -2 : -1).join(' ');
  }
  const i = h1.lastIndexOf(cu);
  return i < 0 ? [h1, ''] : [h1.slice(0, i), h1.slice(i)];
}

const font = (f) => pathToFileURL(join(root, 'public/_fonts', f)).href;
const seal = pathToFileURL(join(root, 'public/wc-seal-512.webp')).href;
// The Chere' app icon (wf-seabreeze AppIcon 1024, cut to 256), kept beside this script.
const chereIcon = pathToFileURL(join(root, 'scripts/cards/chere-icon.png')).href;
const css = `
@font-face{font-family:F;src:url(${font('fraunces-normal-400-700.woff2')});font-weight:400 700}
@font-face{font-family:F;font-style:italic;src:url(${font('fraunces-italic-400-700.woff2')});font-weight:400 700}
@font-face{font-family:P;src:url(${font('plex-sans-400.woff2')});font-weight:400}
@font-face{font-family:P;src:url(${font('plex-sans-600.woff2')});font-weight:600}
@font-face{font-family:M;src:url(${font('jetbrains-mono-500.woff2')});font-weight:500}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;background:#0a0d0c;overflow:hidden}
body{position:relative;font-family:P;color:#eef1ec;
 background:radial-gradient(60% 70% at 8% 0%,rgba(240,160,110,.20),transparent 70%),radial-gradient(55% 65% at 100% 100%,rgba(77,216,168,.14),transparent 70%),#0a0d0c}
.plate{position:absolute;inset:28px;border-radius:30px;border:1px solid rgba(221,228,230,.12);
 background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 40%);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.rv{position:absolute;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f6c39c,#c47b45 55%,#8a5430);box-shadow:0 0 0 4px rgba(211,130,60,.12)}
.tl{top:50px;left:50px}.tr{top:50px;right:50px}.bl{bottom:50px;left:50px}.br{bottom:50px;right:50px}
.mast{position:absolute;top:76px;left:92px;display:flex;align-items:center;gap:18px}
.mast img{width:76px;height:76px}
.name{font-family:F;font-weight:600;font-size:32px;letter-spacing:-.01em}
.loc{font-family:M;font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#d3823c;margin-top:4px}
h1 span.t{display:block}
h1{position:absolute;left:92px;right:92px;top:170px;bottom:150px;display:flex;align-items:center;font-family:F;font-weight:500;letter-spacing:-.025em;line-height:1.02;text-wrap:balance}
.cu{font-style:italic;background:linear-gradient(100deg,#f7b98d 0%,#e3935a 38%,#b8703f 72%,#8f5a35 100%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.foot{position:absolute;left:92px;right:92px;bottom:76px;display:flex;align-items:center;justify-content:space-between}
.tag{font-family:F;font-style:italic;font-size:30px;color:#5fe8b5}
.url{font-family:M;font-size:18px;letter-spacing:.16em;color:#aab7ba}
/* Chere': the app icon's own blues, cream type, mint where the site uses copper */
body.ch{color:#f0ece2;background:radial-gradient(60% 70% at 8% 0%,rgba(0,196,167,.20),transparent 70%),radial-gradient(55% 65% at 100% 100%,rgba(1,109,144,.55),transparent 70%),linear-gradient(150deg,#05506a 0%,#06384b 50%,#062c3b 100%)}
.ch .plate{border-color:rgba(240,236,226,.16)}
.ch .rv{background:radial-gradient(circle at 35% 35%,#c9fff3,#4fe0c6 55%,#00977f);box-shadow:0 0 0 4px rgba(79,224,198,.14)}
.ch .mast img{border-radius:18px;box-shadow:0 8px 22px rgba(0,0,0,.35),0 0 0 1px rgba(240,236,226,.16)}
.ch .loc{color:#4fe0c6}
.ch .cu{background:linear-gradient(100deg,#b8f7e9 0%,#6fe9d2 38%,#22cfb2 72%,#00a58c 100%);-webkit-background-clip:text;background-clip:text}
.ch .tag{color:#f0ece2}.ch .url{color:#b9cdd2}
.lamp{display:inline-block;width:10px;height:10px;border-radius:50%;background:#5fe8b5;box-shadow:0 0 0 4px rgba(77,216,168,.18),0 0 14px rgba(95,232,181,.7);margin-right:14px;vertical-align:2px}
`;
const sizeFor = (t) => (t.length <= 28 ? 112 : t.length <= 44 ? 96 : t.length <= 60 ? 80 : 68);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
mkdirSync(join(root, 'public/og'), { recursive: true });
const tmp = join(root, 'dist', '.og-card.html');
const done = [];
for (const p of pages) {
  const [lead, cu] = split(p.path, p.h1);
  const ch = isChere(p.path);
  const mast = ch
    ? `<img src="${chereIcon}" alt=""><div><div class="name">Chere'</div><div class="loc">By Winters Code</div></div>`
    : `<img src="${seal}" alt=""><div><div class="name">Winters Code</div><div class="loc">Bandon, Oregon</div></div>`;
  const body = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body${ch ? ' class="ch"' : ''}>
<div class="plate"></div><span class="rv tl"></span><span class="rv tr"></span><span class="rv bl"></span><span class="rv br"></span>
<div class="mast">${mast}</div>
<h1 style="font-size:${sizeFor(p.h1)}px"><span class="t">${esc(lead)}<span class="cu">${esc(cu)}</span></span></h1>
<div class="foot"><div class="tag"><span class="lamp"></span>${ch ? 'Said like Sherrie.' : 'Help is just a text away.'}</div><div class="url">${ch ? 'WINTERSCODE.COM/CHERE' : 'WINTERSCODE.COM'}</div></div>
</body></html>`;
  // A file page, so the fonts and the seal load from disk (setContent runs
  // on about:blank, which may not read file: URLs).
  writeFileSync(tmp, body);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'public/og', `${p.slug}.jpg`), type: 'jpeg', quality: 88 });
  done.push(p.path);
}
await browser.close();
try { (await import('node:fs')).unlinkSync(tmp); } catch {}
writeFileSync(join(root, 'src/lib/og-cards.json'), JSON.stringify(done.sort(), null, 2) + '\n');
console.log(`og-cards: ${done.length} cards written to public/og`);
