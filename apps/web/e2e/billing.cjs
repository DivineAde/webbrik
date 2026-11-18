// Paystack upgrade flow through the real UI: checkout redirect, return + verify, payment history, cancel.
// Needs the API started with E2E_PAYSTACK=1 APP_URL=http://localhost:3100 (fake Paystack; see test/e2e-server.ts).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Pay Test'); await p.getByLabel('Email').fill(`pay${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  const wsHref = await p.locator('a[href^="/workspaces/"]').first().getAttribute('href');
  await p.goto(`http://localhost:3100${wsHref}`);
  await p.getByRole('tab', { name: 'Plan & usage' }).click();
  const billing = p.getByLabel('Billing');
  await billing.getByText(/Pro is/).waitFor();
  assert.match(await billing.innerText(), /15,000\.00|NGN/);
  await billing.getByRole('button', { name: 'Upgrade to Pro' }).click();
  // The fake checkout returns straight to the callback; the page must confirm with the server and land on the plan tab.
  await p.waitForURL(/tab=plan/);
  await billing.getByText(/Pro is active/).waitFor();
  await p.getByRole('list', { name: 'Payments' }).getByRole('listitem').first().waitFor();
  assert.ok(!p.url().includes('reference='), 'reference is removed from the address bar');
  await p.reload();
  await p.getByRole('tab', { name: 'Plan & usage', selected: true }).waitFor();
  await billing.getByText(/Pro is active/).waitFor();
  assert.equal(await billing.getByRole('button', { name: 'Upgrade to Pro' }).count(), 0);
  await billing.getByRole('button', { name: 'Cancel subscription' }).click();
  await billing.getByText(/Subscription cancelled/).waitFor();
  assert.deepEqual(errs, []);
  await b.close(); console.log('billing e2e ok');
})().catch((e) => { console.error(e); process.exit(1); });
