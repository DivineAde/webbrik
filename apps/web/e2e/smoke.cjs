// Manual browser smoke test. Run: pnpm --filter @webbrik/web build && (pnpm --filter @webbrik/web exec next start -p 3100 &) && node apps/web/e2e/smoke.cjs
// Requires playwright (npm i -g playwright; NODE_PATH=$(npm root -g)). Promote to a Playwright Test suite.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/editor');
  await p.getByRole('button', { name: 'Heading 1' }).click();
  await p.keyboard.press('Control+k'); await p.keyboard.type('mobile'); await p.keyboard.press('Enter');
  console.log('mobile selected:', await p.getByRole('tab', { name: 'Mobile' }).getAttribute('aria-selected'));
  await p.getByRole('tab', { name: 'Desktop' }).click();
  await p.frameLocator('iframe').locator('h1').click();
  await p.waitForTimeout(300);
  console.log('inspector shows element:', await p.getByLabel('Element name').count());
  const fs = p.getByRole('textbox').filter({ has: p.locator('xpath=self::*[@placeholder="—"]') });
  await p.locator('input[placeholder="—"]').nth(0).fill('flex'); await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  console.log('display flex applied:', (await p.frameLocator('iframe').locator('body').innerHTML()).length > 0);
  await p.waitForTimeout(900);
  console.log('status:', await p.getByRole('status').first().textContent());
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export' }).click()]);
  await dl.saveAs('./site-export.zip'); console.log('download:', dl.suggestedFilename());
  await p.reload(); console.log('recovered h1 after reload:', await p.frameLocator('iframe').locator('h1').count());
  console.log('errors:', errs); await b.close();
})();
