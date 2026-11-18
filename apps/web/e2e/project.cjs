// Project management pages against the real API (:4000) and web (:3100).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Pat'); await p.getByLabel('Email').fill(`p${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Managed'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  await p.getByRole('button', { name: 'Main menu' }).click(); await p.getByRole('menuitem', { name: 'Project settings' }).click(); await p.waitForURL(/\/projects\/.+/);
  // Versions
  await p.getByRole('tab', { name: 'Versions' }).click();
  await p.getByLabel('Version name').fill('Before launch'); await p.getByRole('button', { name: 'Save version' }).click();
  await p.getByText('Before launch').waitFor();
  await p.getByRole('button', { name: 'Compare to current' }).click(); await p.getByRole('region', { name: 'Comparison' }).waitFor();
  // Comments
  await p.getByRole('tab', { name: 'Comments' }).click();
  await p.getByLabel('New comment').fill('Looks good'); await p.getByRole('button', { name: 'Comment' }).click();
  await p.getByText('Looks good').waitFor();
  await p.getByRole('button', { name: 'Create review link' }).click(); await p.getByLabel('Review link').waitFor();
  const link = await p.getByLabel('Review link').inputValue();
  const rp = await (await b.newContext()).newPage(); await rp.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:3100'));
  await rp.getByRole('status').filter({ hasText: 'Awaiting approval' }).waitFor();
  await rp.getByLabel('Your name').fill('Client'); await rp.getByLabel('Comment').fill('Please change the headline'); await rp.getByRole('button', { name: 'Send' }).click();
  await rp.getByText('Please change the headline').waitFor();
  await rp.getByRole('button', { name: 'Approve' }).click(); await rp.getByRole('status').filter({ hasText: /^Approved/ }).waitFor();
  await p.getByRole('button', { name: 'Resolve' }).first().click(); await p.getByText(/resolved/).waitFor();
  // Assets
  await p.getByRole('tab', { name: 'Assets' }).click();
  await p.getByLabel('Choose files').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
  await p.getByText('pixel.png').waitFor();
  // Spoofed file is rejected
  await p.getByLabel('Choose files').setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') });
  await p.getByRole('alert').waitFor();
  // Content
  await p.getByRole('tab', { name: 'Content' }).click();
  await p.getByLabel('Collection name').fill('Posts'); await p.getByRole('button', { name: 'Create collection' }).click();
  await p.getByRole('tab', { name: 'Posts' }).waitFor();
  await p.getByLabel(/^title/).fill('Hello world'); await p.getByRole('button', { name: 'Create item' }).click();
  await p.getByText('/hello-world').waitFor();
  await p.getByLabel('Status of hello-world').selectOption('published');
  // Publish
  await p.getByRole('tab', { name: 'Publish' }).click();
  await p.getByLabel('Variable name').fill('API_KEY'); await p.getByLabel('Variable value').fill('secret'); await p.getByRole('button', { name: 'Save' }).click();
  await p.getByText('API_KEY').waitFor();
  assert.equal(await p.getByText('secret').count(), 0, 'env values are never shown');
  await p.getByRole('button', { name: 'Deploy preview' }).click();
  await p.getByText(/Revision \d+/).first().waitFor({ timeout: 15000 });
  assert.deepEqual(errs, []);
  console.log('project ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
