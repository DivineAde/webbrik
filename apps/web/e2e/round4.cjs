// Client-side navigation, resend verification, context menu stays on screen, drag grip reorders sections.
const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3100/login'); await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('R4'); await p.getByLabel('Email').fill(`r4${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  // Navigation keeps the page alive (no full reload) and the sidebar stays filled.
  await p.getByText('Account settings').first().waitFor();
  await p.evaluate(() => { window.__alive = 1; });
  await p.getByRole('link', { name: 'Account settings' }).first().click(); await p.waitForURL('**/settings');
  assert.equal(await p.evaluate(() => window.__alive), 1, 'settings navigation reloaded the page');
  await p.getByRole('link', { name: 'Workspace' }).first().click(); await p.waitForURL(/\/workspaces\//);
  assert.equal(await p.evaluate(() => window.__alive), 1, 'workspace navigation reloaded the page');
  await p.getByRole('link', { name: 'Account settings' }).first().click(); await p.waitForURL('**/settings');
  // Resend verification
  await p.getByRole('button', { name: 'Resend verification email' }).click();
  await p.getByText(/Sent to /).waitFor();
  assert.equal(await p.getByRole('button', { name: /Resend in/ }).isDisabled(), true);
  // Editor: reorder with the grip, menu fits the viewport
  await p.goto('http://localhost:3100/dashboard'); await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('R4'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  for (const t of ['Heading 1', 'Paragraph']) { await p.getByRole('button', { name: 'Container', exact: true }).click(); await p.getByRole('button', { name: t, exact: true }).click(); }
  const order = async () => p.evaluate(() => JSON.stringify(window.__order?.() ?? null));
  await p.getByRole('tablist', { name: 'Left panel' }).getByRole('tab', { name: 'navigator' }).click();
  const rows = () => p.locator('[data-layer-id]').allInnerTexts();
  const before = await rows();
  const grip = p.locator('[data-handle="reorder"]'); await grip.waitFor();
  const gb = await grip.boundingBox(); assert.ok(gb);
  const f = p.frameLocator('iframe').first(); const frameBox = await p.locator('iframe').first().boundingBox();
  await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await p.mouse.down();
  await p.mouse.move(gb.x + 40, frameBox.y + 12, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(500);
  const after = await rows(); assert.notDeepEqual(after, before, 'grip drag did not change order');
  // Context menu near the bottom stays inside the window
  await p.mouse.click(frameBox.x + 200, frameBox.y + frameBox.height - 10, { button: 'right' });
  const menu = p.getByRole('menu').first(); await menu.waitFor();
  const mb = await menu.boundingBox(); assert.ok(mb.y >= 0 && mb.y + mb.height <= 720 + 1, `menu off screen ${JSON.stringify(mb)}`);
  assert.deepEqual(errs, []); console.log('round4 ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
