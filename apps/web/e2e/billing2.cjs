// Plan picker, coupon preview, tax lines, one-off discounted purchase, invoice PDF download, then a prorated Pro -> Team upgrade.
// Needs the API started with: E2E_PAYSTACK=1 E2E_TAX=7.5 ADMIN_EMAILS=admin@example.com APP_URL=http://localhost:3100 WEB_ORIGIN=http://localhost:3100
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true }); const p = await c.newPage(); require('./auto-confirm.cjs').autoConfirm(p); return p; };
  const signup = async (p, email) => {
    await p.goto('http://localhost:3100/login'); await p.getByRole('button', { name: /Need an account/ }).click();
    await p.getByLabel('Name').fill('B2'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill('correct horse battery staple');
    await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  };
  // Platform admin creates a coupon through the API (there is no coupon UI by design)
  const admin = await mk(); await signup(admin, 'admin@example.com');
  const code = `SAVE${Date.now() % 100000}`;
  const made = await admin.request.fetch('http://localhost:3100/api/admin/coupons', { method: 'POST', headers: { 'x-requested-with': 'webbrik', 'content-type': 'application/json' }, data: { code, percentOff: 20, maxRedemptions: 1 } });
  assert.equal(made.status(), 201);

  const p = await mk(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await signup(p, `b2${Date.now()}@example.com`);
  const ws = await p.locator('a[href^="/workspaces/"]').first().getAttribute('href'); await p.goto(`http://localhost:3100${ws}`);
  await p.getByRole('tab', { name: 'Plan & usage' }).click();
  const billing = p.getByLabel('Billing');
  const group = billing.getByRole('radiogroup', { name: 'Plan' }); await group.waitFor();
  assert.match(await group.innerText(), /Pro[\s\S]*Team/); assert.match(await group.innerText(), /VAT/);

  // Price breakdown with tax: 15,000.00 + 7.5% = 16,125.00
  const price = billing.getByRole('term').first(); await price.waitFor();
  await billing.getByText('Total today').waitFor(); assert.match(await billing.innerText(), /16,125\.00/); assert.match(await billing.innerText(), /1,125\.00/);

  // Coupon: bad code shows an error; good code shows the discount and the one-off notice
  await billing.getByLabel('Coupon code').fill('NOPE'); await billing.getByRole('button', { name: 'Apply' }).click();
  await billing.getByRole('alert').filter({ hasText: /isn't valid/ }).waitFor();
  await billing.getByLabel('Coupon code').fill(code.toLowerCase()); await billing.getByRole('button', { name: 'Apply' }).click();
  await billing.getByText(`Coupon ${code}`).waitFor();
  assert.match(await billing.innerText(), /12,900\.00/);                     // (15,000 - 20%) = 12,000 + 7.5% VAT
  assert.match(await billing.innerText(), /don't renew automatically/);

  await billing.getByRole('button', { name: 'Upgrade to Pro' }).click();
  await p.waitForURL(/tab=plan/); await billing.getByText(/Pro is active/).waitFor();
  const row = p.getByRole('list', { name: 'Payments' }).getByRole('listitem').first(); await row.waitFor();
  assert.match(await row.innerText(), new RegExp(code));
  const [dl] = await Promise.all([p.waitForEvent('download'), row.getByRole('link', { name: /Invoice INV-/ }).click()]);
  assert.match(dl.suggestedFilename(), /^INV-\d{4}-\d{6}\.pdf$/);
  assert.equal(fs.readFileSync(await dl.path()).subarray(0, 5).toString(), '%PDF-');

  // Upgrade Pro -> Team: prorated, and the paid period doesn't move
  await billing.locator('summary', { hasText: 'Upgrade to Team' }).click();
  await billing.getByText(/prorated for the rest of this period/).waitFor();
  assert.match(await billing.innerText(), /one-off charge/);
  await billing.getByRole('button', { name: /Upgrade to Team for/ }).click();
  await p.waitForURL(/tab=plan/); await billing.getByText(/Team is active/).waitFor();
  assert.equal(await p.getByRole('list', { name: 'Payments' }).getByRole('listitem').count(), 2);
  assert.deepEqual(errs, []);
  console.log('billing2 e2e ok'); await b.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
