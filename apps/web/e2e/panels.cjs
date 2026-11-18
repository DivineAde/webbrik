// Panels smoke test (same setup as smoke.cjs). Exits non-zero on any failed check.
const { chromium } = require('playwright');
const { openRight, signOut } = require('./helpers.cjs');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:3100/editor');
  const frame = p.frameLocator('iframe');
  // Templates
  await p.getByRole('tab', { name: 'templates' }).click();
  await p.getByRole('button', { name: /^Hero/ }).click();
  await p.getByRole('button', { name: /^Feature grid/ }).click();
  await frame.locator('h1').waitFor();
  assert.equal(await frame.locator('h1').innerText(), 'Build something people love');
  // Quality
  await openRight(p, 'quality');
  assert.ok(await p.getByRole('status').filter({ hasText: /error|issues/ }).count() >= 1);
  // Tokens
  await p.getByRole('tab', { name: 'tokens' }).click();
  await p.getByLabel('Token name').fill('--color-primary'); await p.getByLabel('Token value').fill('#123456');
  await p.getByRole('button', { name: 'Add token' }).click();
  assert.equal(await p.getByRole('textbox', { name: '--color-primary', exact: true }).inputValue(), '#123456');
  // Pages
  await p.getByRole('tab', { name: 'pages' }).click();
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  assert.ok(await p.getByText('/page-2').count() >= 1);
  // Code
  await openRight(p, 'code');
  await p.getByRole('textbox', { name: 'Custom CSS' }).fill('h1{letter-spacing:0.5px}'); await p.getByRole('textbox', { name: 'Custom CSS' }).blur();
  // Animate
  await p.getByRole('tab', { name: 'animate' }).click();
  await p.getByRole('button', { name: '+ fade-in' }).click();
  assert.ok(await p.getByText('fade-in').count() >= 1);
  // Undo all the way is safe
  await openRight(p, 'history');
  assert.deepEqual(errs, []);
  console.log('panels ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
