// Dashboard checklist (driven by real data), help center search, email change request, and the OAuth callback's state check.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const email = `ob${Date.now()}@example.com`;
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Ob'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');

  // Checklist: starts at 0 of 5 (verified email may or may not be required in this env: count only what we know)
  const cl = p.getByTestId('checklist'); await cl.waitFor();
  await cl.getByText(/Create a project/).first().waitFor();
  assert.match(await cl.innerText(), /of 5/);
  const before = Number(/(\d) of 5/.exec(await cl.innerText())[1]);
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('First'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  await p.goto('http://localhost:3100/dashboard');
  await p.getByTestId('checklist').waitFor();
  await p.waitForFunction((n) => { const m = /(\d) of 5/.exec(document.querySelector('[data-testid=checklist]').textContent); return m && Number(m[1]) === n + 1; }, before);
  await p.getByTestId('checklist').getByRole('button', { name: 'Dismiss' }).click();
  await p.getByTestId('checklist').waitFor({ state: 'detached' });
  await p.reload(); await p.getByRole('link', { name: 'First', exact: true }).waitFor(); assert.equal(await p.getByTestId('checklist').count(), 0); // dismissal is remembered

  // Help center
  await p.getByRole('link', { name: 'Help center' }).click(); await p.waitForURL('**/help');
  const total = Number(/(\d+) articles/.exec(await p.getByRole('status').innerText())[1]); assert.ok(total >= 12);
  await p.getByRole('searchbox', { name: 'Search help' }).fill('coupon');
  await p.getByText('Plans, coupons, upgrades and invoices').waitFor(); assert.equal(await p.locator('details').count(), 1);
  await p.getByRole('searchbox', { name: 'Search help' }).fill('zzzzqqq'); await p.getByText(/Nothing matches/).waitFor();

  // Email change request from settings (the confirm step is covered by API tests)
  await p.goto('http://localhost:3100/settings');
  const f = p.getByRole('form', { name: 'Change email' }); await f.waitFor();
  await f.getByLabel('New email address').fill(`new-${email}`); await f.getByLabel('Password to confirm').fill('correct horse battery staple');
  await f.getByRole('button', { name: 'Change email' }).click();
  await p.getByText(/Check the new address for a confirmation link/).waitFor();
  await f.getByLabel('New email address').fill(email); await f.getByLabel('Password to confirm').fill('wrong password here');
  await f.getByRole('button', { name: 'Change email' }).click(); await p.getByRole('alert').first().waitFor();

  // OAuth callback refuses a response whose state we never issued, and an unknown provider
  await p.goto('http://localhost:3100/oauth/github?code=abc&state=forged');
  await p.getByText(/could not be verified/).waitFor();
  await p.goto('http://localhost:3100/oauth/nope?code=abc'); await p.getByText(/Unknown sign-in provider/).waitFor();
  assert.deepEqual(errs, []);
  console.log('onboarding ok'); await b.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
