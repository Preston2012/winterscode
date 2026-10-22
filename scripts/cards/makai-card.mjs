// Work card for Makai Painting, 1200x630, rendered from the client site's own
// marks so the card looks like the build it opens. Run from the wc-makai repo
// root (fonts, logo, swatches and the job photo live there):
//   cd /workspaces/wc-makai && PLAYWRIGHT_PATH=/usr/local/lib/node_modules/playwright \
//     node /workspaces/winterscode/scripts/cards/makai-card.mjs
// Writes /tmp/makai-card-2x.png; the ladder (1280/720/480 webp) is cut from it.
//
// Differences from Makai's own share card (wc-makai scripts/sharecard.mjs): no
// phone number (this card sells the build, not her phone line), no drips baked
// in (the homepage pours them live over the card, so a baked pour would double
// up), and the content sits in the middle band because the homepage slot crops
// the top and bottom of a 1200x630 card at phone width.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const b64 = (p) => readFileSync(p).toString('base64');
const anton = b64('node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2');
const cond = b64('node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2');
const logo = b64('public/brand/makai-lockup-640.png');
const photo = b64('photos/mp-a209.jpg');
const svg = (f) => `data:image/svg+xml;base64,${Buffer.from(readFileSync('public/brand/' + f, 'utf8')).toString('base64')}`;
const PINK = '#e81068', GOLD = '#e8b000', INK = '#141414';
const words = [
  ['Interior.', svg('swatch-gold-1.svg'), INK, 0],
  ['Exterior.', svg('swatch-pink-2.svg'), '#fff', 16],
  ['Repairs.', svg('swatch-paper-3.svg'), INK, 0],
  ['Hauling.', svg('swatch-gold-3.svg'), INK, 26],
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:A;src:url(data:font/woff2;base64,${anton}) format('woff2')}
@font-face{font-family:C;src:url(data:font/woff2;base64,${cond}) format('woff2');font-weight:700}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;position:relative;overflow:hidden;background:${INK};font-family:C}
.l{position:absolute;left:0;top:0;width:620px;height:630px;padding:104px 0 0 58px}
.logo{display:block;width:236px}
h1{font-family:A;font-weight:400;font-size:62px;line-height:.98;text-transform:uppercase;display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:22px}
h1 span{display:block;padding:3px 32px 0 14px;margin-left:-10px;background:0 50%/100% 100% no-repeat}
.foot{position:absolute;left:58px;bottom:58px;display:flex;align-items:center;gap:18px;color:#d0d0d0;font-size:24px;letter-spacing:.04em}
.ccb{display:inline-block;border:3px solid ${GOLD};color:${GOLD};font-size:19px;letter-spacing:.12em;padding:5px 11px 4px;border-radius:4px;white-space:nowrap}
.r{position:absolute;right:0;top:0;width:580px;height:630px;overflow:hidden}
.r img{width:100%;height:100%;object-fit:cover;object-position:50% 42%;display:block}
.r:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,${INK} 0,rgba(20,20,20,0) 14%)}
.bar{position:absolute;left:0;right:0;bottom:0;height:12px;background:linear-gradient(90deg,${PINK} 0 34%,${GOLD} 34% 100%)}
</style></head><body>
<div class="r"><img src="data:image/jpeg;base64,${photo}"></div>
<div class="l">
<img class="logo" src="data:image/png;base64,${logo}">
<h1>${words.map(([t, bg, c, ml]) => `<span style="background-image:url(${bg});color:${c};margin-left:${ml - 10}px">${t}</span>`).join('')}</h1>
<div class="foot"><span>makaipainting.com &middot; Coos Bay, OR</span><span class="ccb">CCB #192776</span></div>
</div>
<div class="bar"></div>
</body></html>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await pg.setContent(html);
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(450);
const buf = await pg.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await br.close();
writeFileSync('/tmp/makai-card-2x.png', buf);
console.log('makai card 2x', buf.length, 'bytes');
