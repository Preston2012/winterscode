// Full-page screenshots of a built dist/client, served locally, JavaScript off,
// so two builds can be compared pixel for pixel. Usage: PLAYWRIGHT=... CHROMIUM=... node scripts/audit/page-shots.cjs dist/client OUTDIR PORT
// Run it on the build before a change and after, then compare with pixel-diff.py.
// Run "before" twice: pages whose two before shots differ are noisy (reels, video posters).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [dist, out, port] = [process.argv[2], process.argv[3], Number(process.argv[4] || 8931)];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(dist, p);
  if (p.endsWith('/')) f = path.join(dist, p, 'index.html');
  else if (!path.extname(p)) f = f + '.html';
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
}).listen(port);
const PAGES = ['/', '/work', '/chere', '/process', '/insights/coos-county-website-audit', '/web-design-coos-bay', '/work/stainslayer-ai', '/work/seabreeze', '/pricing', '/contact', '/services', '/work/baseline-marketing', '/services/ai-automation'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, javaScriptEnabled: false, reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    for (const u of PAGES) {
      await pg.goto(`http://127.0.0.1:${port}${u}`, { waitUntil: 'networkidle' });
      // Lazy images and backgrounds load only near the viewport, so a full-page shot
      // is a race unless every image is made eager and decoded first.
      await pg.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
        await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
        await document.fonts.ready;
      });
      await pg.waitForLoadState('networkidle');
      await pg.waitForTimeout(300);
      await pg.screenshot({ path: path.join(out, `${w}${u.replace(/\//g, '_') || '_'}.png`), fullPage: true });
    }
    await ctx.close();
  }
  await b.close(); server.close(); console.log('SHOTS-DONE', out);
})();
