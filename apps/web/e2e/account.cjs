// Account + workspace admin flows against the real API (:4000) and web (:3100).
const { chromium } = require('playwright');
const { openRight, signOut } = require('./helpers.cjs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '')) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))); };
const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac('sha1', b32(secret)).update(c).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0'); };
// Avoid computing a code in the last seconds of its 30s window (it could expire before the server checks it).
const freshTotp = async (secret) => { const left = 30000 - (Date.now() % 30000); if (left < 4000) await new Promise((r) => setTimeout(r, left + 200)); return totp(secret); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const email = `t${Date.now()}@example.com`, pw1 = 'correct horse battery staple', pw2 = 'another long passphrase 42';
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Team Lead'); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(pw1);
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  // Settings: profile, password
  await p.getByRole('button', { name: 'Account menu' }).click(); await p.getByRole('menuitem', { name: 'Account settings' }).click(); await p.waitForURL('**/settings');
  await p.getByLabel('Name').fill('Team Leader'); await p.getByRole('button', { name: 'Save' }).click(); await p.getByText('Saved.').waitFor();
  await p.getByLabel('Current password').fill(pw1); await p.getByLabel(/^New password/).fill(pw2); await p.getByRole('button', { name: 'Change password' }).click();
  await p.getByText(/Password changed/).waitFor();
  assert.ok(await p.getByText('This device').count() === 1);
  // MFA on, then sign out and back in requiring the code
  await p.getByRole('button', { name: 'Set up' }).click();
  const secret = (await p.getByLabel('Setup key').innerText()).trim();
  await p.getByLabel('Authentication code').fill(await freshTotp(secret)); await p.getByRole('button', { name: 'Turn on' }).click();
  await p.getByText('Two-factor authentication is on.').waitFor();
  await p.goto('http://localhost:3100/dashboard'); await signOut(p); await p.waitForURL('**/login');
  await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill(pw2); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByLabel('Authentication code').waitFor(); assert.ok(await p.getByRole('alert').count() >= 1);
  await p.getByLabel('Authentication code').fill(await freshTotp(secret)); await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL('**/dashboard');
  // Workspace: rename, quota message on free plan, invite on pro, revoke
  await p.getByRole('link', { name: 'Workspace' }).click(); await p.waitForURL(/\/workspaces\/.+/);
  const wid = p.url().split('/').pop();
  await p.getByRole('tab', { name: 'General' }).click(); await p.getByLabel('Workspace name').fill('Acme Studio'); await p.getByRole('button', { name: 'Save' }).click();
  await p.getByRole('heading', { name: 'Acme Studio' }).waitFor();
  await p.getByRole('tab', { name: 'Members' }).click();
  await p.getByLabel('Invite email').fill('mate@example.com'); await p.getByRole('button', { name: 'Invite' }).click();
  await p.getByRole('alert').filter({ hasText: /allows 1 member/ }).waitFor();
  const r = await ctx.request.post(`http://localhost:3100/api/workspaces/${wid}/plan`, { data: { plan: 'pro' }, headers: { 'x-requested-with': 'webbrik' } }); assert.equal(r.status(), 200);
  await p.getByRole('button', { name: 'Invite' }).click();
  await p.getByText('Invitation sent to mate@example.com.').waitFor();
  await p.getByText('Pending invitations').waitFor();
  await p.getByRole('button', { name: 'Revoke' }).click(); await p.getByText('Pending invitations').waitFor({ state: 'detached' });
  await p.getByRole('tab', { name: 'Plan & usage' }).click();
  await p.getByRole('progressbar', { name: 'Projects' }).waitFor(); await p.getByLabel('Billing').waitFor();
  await p.getByRole('tab', { name: 'Activity' }).click(); await p.getByText('member.invite', { exact: false }).first().waitFor();
  // Invalid invite token + recovery pages render
  await p.goto('http://localhost:3100/invite?token=not-a-real-token-123'); await p.getByRole('button', { name: 'Accept invitation' }).click(); await p.getByRole('alert').waitFor();
  await p.context().clearCookies(); await p.goto('http://localhost:3100/forgot-password'); await p.getByLabel('Email').fill('nobody@example.com'); await p.getByRole('button', { name: 'Send reset link' }).click(); await p.getByRole('status').waitFor();
  assert.deepEqual(errs, []);
  console.log('account ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
