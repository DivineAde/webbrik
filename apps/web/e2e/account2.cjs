// MFA QR + recovery codes, webhook delivery log, workspace and account deletion — real UI against the real API.
const { chromium } = require('playwright');
const { openRight, signOut } = require('./helpers.cjs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '')) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))); };
const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac('sha1', b32(secret)).update(c).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0'); };
const freshTotp = async (secret) => { const left = 30000 - (Date.now() % 30000); if (left < 4000) await new Promise((r) => setTimeout(r, left + 200)); return totp(secret); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const email = `d${Date.now()}@example.com`, pw = 'correct horse battery staple';
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Del Test'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(pw);
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');

  // Webhook log (the sandbox has no outbound network, so the test delivery must show up as Failed with a reason)
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Hooks'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/').pop();
  await p.goto(`http://localhost:3100/projects/${pid}`);
  await p.getByRole('tab', { name: 'Settings' }).click();
  await p.getByLabel('Webhook URL').fill('https://hooks.example.com/in'); await p.getByRole('button', { name: 'Add webhook' }).click();
  await p.getByText('Nothing delivered yet').waitFor();
  await p.getByRole('button', { name: 'Send test' }).click();
  const row = p.getByRole('list', { name: 'Webhook deliveries' }).getByRole('listitem').first();
  await row.getByText('Failed', { exact: true }).waitFor(); assert.match(await row.innerText(), /webhook\.test/);

  // MFA with QR + recovery codes
  await p.goto('http://localhost:3100/settings');
  await p.getByRole('button', { name: 'Set up' }).click();
  const qr = p.getByRole('img', { name: /QR code/ }); await qr.waitFor();
  assert.ok((await qr.getAttribute('src')).startsWith('data:image/svg+xml'));
  assert.ok(await qr.evaluate((i) => i.naturalWidth > 0));
  const secret = (await p.getByLabel('Setup key').innerText()).trim();
  await p.getByLabel('Authentication code').fill(await freshTotp(secret)); await p.getByRole('button', { name: 'Turn on' }).click();
  const box = p.getByRole('status', { name: 'Recovery codes' }); await box.waitFor();
  const codes = await box.locator('li').allInnerTexts(); assert.equal(codes.length, 8); assert.match(codes[0], /^[0-9a-f]{5}-[0-9a-f]{5}$/);
  await box.getByRole('button', { name: 'I saved them' }).click(); await box.waitFor({ state: 'detached' });
  await p.getByText(/Recovery codes left: 8/).waitFor();
  // Sign in with a recovery code (once)
  await p.goto('http://localhost:3100/dashboard'); await signOut(p); await p.waitForURL('**/login');
  await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(pw); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByLabel(/recovery code/).fill(codes[0]); await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL('**/dashboard');
  await p.goto('http://localhost:3100/settings'); await p.getByText(/Recovery codes left: 7/).waitFor();

  // Workspace deletion needs the exact name
  await p.goto('http://localhost:3100/dashboard'); await p.getByRole('link', { name: 'Workspace' }).click(); await p.waitForURL(/\/workspaces\/.+/);
  await p.getByRole('tab', { name: 'General' }).click();
  const wsName = await p.getByLabel('Workspace name', { exact: true }).inputValue();
  const del = p.getByRole('button', { name: 'Delete workspace' }); assert.ok(await del.isDisabled());
  await p.getByLabel('Name to confirm deletion').fill(wsName); await del.click(); await p.waitForURL('**/dashboard');
  assert.equal(await p.getByText('Hooks').count(), 0);

  // Account deletion (password + current MFA code), then the account can no longer sign in
  await p.goto('http://localhost:3100/settings');
  await p.getByLabel(/^Your password/).fill(pw); await p.locator('form', { hasText: 'Delete my account' }).getByLabel('Authentication code').fill(await freshTotp(secret));
  await p.getByRole('button', { name: 'Delete my account' }).click(); await p.waitForURL('**/login');
  await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(pw); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('alert').waitFor();
  assert.deepEqual(errs.filter((m) => !/401|Unauthorized/.test(m)), []);
  console.log('account2 ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
