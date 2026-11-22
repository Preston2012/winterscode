// /work live scores: how the card chip and the details row react to the /api/workshop
// feed in five cases (real, dated and newer, undated fallback, dated and older, down).
// Usage: PLAYWRIGHT=... CHROMIUM=... node scripts/audit/work-scores-test.cjs https://HOST
// Expected: real and dated-newer replace the numbers and the date; the other three keep
// the stored, dated read.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2];
const row = (pg) => pg.evaluate(() => {
  const c = document.querySelector('[data-chip-site="grand-management"]');
  return c ? { chip: c.querySelector('[data-chip-perf]')?.textContent, nums: c.querySelector('[data-lh-nums]')?.textContent, at: c.querySelector('[data-lh-at]')?.textContent } : null;
});
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const run = async (name, fulfil) => {
    const pg = await (await b.newContext()).newPage();
    if (fulfil) await pg.route('**/api/workshop', (r) => fulfil(r));
    await pg.goto(base + '/work', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    console.log(name.padEnd(28), JSON.stringify(await row(pg)));
    await pg.close();
  };
  const quad = (p) => [p, 100, 100, 100];
  await run('live feed (real)', null);
  await run('dated, newer, grand 91', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lighthouse: { grand: quad(91), measured_at: '2026-11-23T08:00:00Z' }, security: { sites: {} } }) }));
  await run('undated fallback, grand 98', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lighthouse: { grand: quad(98), measured: 'within 12 hours' }, security: { sites: {} } }) }));
  await run('dated, older, grand 80', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lighthouse: { grand: quad(80), measured_at: '2026-06-24T00:00:00Z' }, security: { sites: {} } }) }));
  await run('feed down (500)', (r) => r.fulfill({ status: 500, body: '' }));
  await b.close();
})();
