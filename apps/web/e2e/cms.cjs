// CMS binding: repeater + field binding in the editor, item editing, dynamic page preview. Needs API :4000 and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Cms'); await p.getByLabel('Email').fill(`c${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Blog'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/').pop();
  // Content through the real UI
  await p.goto(`http://localhost:3100/projects/${pid}`);
  await p.getByRole('tab', { name: 'Content' }).click();
  await p.getByLabel('Collection name').fill('Posts'); await p.getByLabel('Fields').fill('title:text*, views:number'); await p.getByRole('button', { name: 'Create collection' }).click();
  await p.getByRole('tab', { name: 'Posts' }).waitFor();
  for (const [t, v] of [['Alpha', '1'], ['Beta', '5']]) { await p.getByLabel(/^title/).fill(t); await p.getByLabel(/^views/).fill(v); await p.getByRole('button', { name: 'Create item' }).click(); await p.getByText(`/${t.toLowerCase()}`).waitFor(); }
  // Edit an item
  await p.getByRole('listitem').filter({ hasText: '/alpha' }).getByRole('button', { name: 'Edit' }).click();
  await p.getByLabel(/^title/).fill('Alpha edited'); await p.getByRole('button', { name: 'Save changes' }).click();
  await p.getByText('Alpha edited').waitFor();
  // Editor: repeater + binding
  await p.goto(`http://localhost:3100/editor/${pid}`);
  const frame = p.frameLocator('iframe');
  await p.getByRole('button', { name: 'Container', exact: true }).click();          // selected container
  await p.getByRole('button', { name: 'Heading 2', exact: true }).click();          // child inside it
  await p.getByRole('tab', { name: 'navigator' }).click();
  await p.locator('[role=treeitem] > div', { hasText: /^div/ }).first().click();
  await p.getByLabel('Repeat collection').selectOption({ label: 'Posts' });
  await p.getByLabel('Repeat sort').selectOption('views'); await p.getByLabel('Repeat order').selectOption('desc');
  await p.locator('[role=treeitem] > div', { hasText: /^h2/ }).first().click();
  await p.getByLabel('Binding collection').selectOption({ label: 'Posts' });
  await p.getByLabel('Binding field').selectOption('title');
  await frame.locator('h2').nth(1).waitFor();
  assert.deepEqual(await frame.locator('h2').allInnerTexts(), ['Beta', 'Alpha edited']);   // sorted by views desc
  // Dynamic page shows first item
  await p.getByRole('tab', { name: 'pages' }).click();
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.getByLabel('Route').fill('/blog/:slug'); await p.getByLabel('Route').blur();
  await p.getByLabel('Page collection').selectOption({ label: 'Posts' });
  await p.getByRole('tab', { name: 'elements' }).click();
  await p.getByRole('button', { name: 'Heading 1', exact: true }).click();
  await p.getByRole('tab', { name: 'navigator' }).click();
  await p.locator('[role=treeitem] > div', { hasText: /^h1/ }).first().click();
  await p.getByLabel('Binding collection').selectOption({ label: 'Posts' });
  await p.getByLabel('Binding field').selectOption('title');
  await frame.locator('h1').waitFor();
  assert.match(await frame.locator('h1').innerText(), /Alpha edited|Beta/);
  await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved', null, { timeout: 8000 });
  assert.deepEqual(errs, []);
  console.log('cms ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
