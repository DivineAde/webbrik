// Full-stack test: needs API on :4000 (DISABLE_RATE_LIMIT=1) and web on :3100 (API_URL default).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const email = `u${Date.now()}@example.com`;
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Test User'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Synced site'); await p.getByRole('button', { name: 'Create project' }).click();
  await p.waitForURL(/\/editor\/.+/);
  const frame = p.frameLocator('iframe');
  await p.getByRole('tab', { name: 'templates' }).click();
  await p.getByRole('button', { name: /^Hero/ }).click();
  await frame.locator('h1').waitFor();
  await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved', null, { timeout: 8000 });
  await p.reload();
  await frame.locator('h1').waitFor({ timeout: 8000 });
  assert.equal(await frame.locator('h1').innerText(), 'Build something people love');
  // Second session sees the same document (server is the source of truth)
  const p2 = await (await b.newContext()).newPage();
  await p2.goto('http://localhost:3100/editor'); // anonymous sandbox is separate
  assert.equal(await p2.frameLocator('iframe').locator('h1').count(), 0);
  assert.deepEqual(errs, []);
  console.log('fullstack ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
