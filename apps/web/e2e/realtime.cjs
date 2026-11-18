// Two browsers on one project: an edit in A reaches B through the WebSocket push (well inside the 20 s safety poll).
// Needs API :4000 started with WEB_ORIGIN=http://localhost:3100 and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1500, height: 900 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const A = await mk(), B = await mk();
  const email = `rt${Date.now()}@example.com`, pass = 'correct horse battery staple';
  await A.goto('http://localhost:3100/login');
  await A.getByRole('button', { name: /Need an account/ }).click();
  await A.getByLabel('Name').fill('RT'); await A.getByLabel('Email').fill(email); await A.getByLabel('Password').fill(pass);
  await A.getByRole('button', { name: 'Create account' }).click(); await A.waitForURL('**/dashboard');
  await A.getByRole('button', { name: 'New project' }).first().click(); await A.getByLabel('Project name').fill('Live'); await A.getByRole('button', { name: 'Create project' }).click(); await A.waitForURL(/\/editor\/.+/);
  const url = A.url();
  await B.goto('http://localhost:3100/login');
  await B.getByLabel('Email').fill(email); await B.getByLabel('Password').fill(pass); await B.getByRole('button', { name: 'Sign in' }).click(); await B.waitForURL('**/dashboard');
  await B.goto(url);
  for (const p of [A, B]) await p.getByTestId('live-indicator').filter({ hasText: 'Live' }).waitFor({ timeout: 15000 });
  await B.getByRole('tab', { name: 'navigator' }).click();
  assert.equal(await B.locator('[role=treeitem]').filter({ hasText: /^div/ }).count(), 0);
  const t0 = Date.now();
  await A.getByRole('button', { name: 'Container', exact: true }).click();
  await B.locator('[role=treeitem]').filter({ hasText: /^div/ }).first().waitFor({ timeout: 8000 });
  const ms = Date.now() - t0; console.log('delivered in', ms, 'ms');
  assert.ok(ms < 3000, `push should beat the 3 s poll, took ${ms}`);
  assert.deepEqual(errs, []);
  console.log('realtime ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
