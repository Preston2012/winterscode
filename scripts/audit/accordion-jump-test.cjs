// One-open-at-a-time folds: open the first item in a set, tap each later one, and report how
// far the tapped question moved on screen and whether exactly one item is open. A move of more
// than a few pixels is the jump src/lib/hold-accordion.ts exists to stop (993px on the home FAQ
// before it). Exits 1 on a move over 4px or a wrong open state.
// Usage: PLAYWRIGHT=... node scripts/audit/accordion-jump-test.cjs https://HOST /path 'details[name="faq"]' [chromium|webkit|firefox]
// Folds inside an inactive tab are not visible and cannot be tapped; pick a visible set.
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const [base, path, sel, engine = 'chromium'] = process.argv.slice(2);
(async () => {
  const b = await pw[engine].launch();
  let fail = false;
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: vp.width < 600, isMobile: engine !== 'firefox' && vp.width < 600 });
    const pg = await ctx.newPage();
    await pg.goto(base + path, { waitUntil: 'networkidle' });
    const n = await pg.$$eval(sel, (els) => els.length);
    let worst = 0, bad = 0;
    for (let k = 1; k < n; k++) {
      await pg.reload({ waitUntil: 'networkidle' });
      const items = await pg.$$(sel);
      const first = await items[0].$('summary');
      await first.scrollIntoViewIfNeeded();
      if (!(await items[0].evaluate((d) => d.open))) { if (vp.width < 600) await first.tap(); else await first.click(); }
      await pg.waitForTimeout(250);
      const target = await items[k].$('summary');
      await target.scrollIntoViewIfNeeded();
      const before = await target.evaluate((e) => e.getBoundingClientRect().top);
      if (vp.width < 600) await target.tap(); else await target.click();
      await pg.waitForTimeout(400);
      const after = await target.evaluate((e) => e.getBoundingClientRect().top);
      const nOpen = await pg.$$eval(sel, (els) => els.filter((d) => d.open).length);
      const open = await items[k].evaluate((d) => d.open);
      if (nOpen !== 1 || !open) bad++;
      worst = Math.max(worst, Math.abs(after - before));
    }
    if (worst > 4 || bad) fail = true;
    console.log(`${engine} ${vp.width} ${path}: items ${n}, worst move ${Math.round(worst)}px, wrong open state ${bad}`);
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
