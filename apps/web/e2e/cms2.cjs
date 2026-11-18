// CMS: reference fields, rich text, item history/restore, repeater filters and reference-path bindings. Needs API :4000 and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Cms2'); await p.getByLabel('Email').fill(`c2${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Blog2'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/').pop();
  await p.goto(`http://localhost:3100/projects/${pid}`); await p.getByRole('tab', { name: 'Content' }).click();
  // Authors, then Posts with a reference field
  await p.getByLabel('Collection name').fill('Authors'); await p.getByLabel('Fields').fill('name:text*'); await p.getByRole('button', { name: 'Create collection' }).click();
  await p.getByRole('tab', { name: 'Authors' }).waitFor();
  await p.getByLabel(/^name/).fill('Ada'); await p.getByRole('button', { name: 'Create item' }).click(); await p.getByText('/ada').waitFor();
  await p.getByLabel('Collection name').fill('Posts'); await p.getByLabel('Fields').fill('title:text*, body:richtext, author:reference>authors');
  await p.getByRole('button', { name: 'Create collection' }).click(); await p.getByRole('tab', { name: 'Posts' }).click();
  // Create a post with formatted rich text and a reference
  await p.getByLabel(/^title/).fill('Alpha');
  const rt = p.getByRole('textbox', { name: 'body', exact: true }); await rt.click(); await p.keyboard.type('Hello world');
  await p.keyboard.press('Control+A'); await p.getByRole('button', { name: 'Bold' }).click();
  await p.getByRole('combobox', { name: 'author' }).selectOption({ label: 'Ada' });
  await p.getByRole('button', { name: 'Create item' }).click(); await p.getByText('/alpha').waitFor();
  await p.getByLabel(/^title/).fill('Beta'); await p.getByRole('button', { name: 'Create item' }).click(); await p.getByText('/beta').waitFor();
  // Edit: the stored rich text round-trips with its formatting, then a change is restorable from history
  const alpha = p.getByRole('listitem').filter({ hasText: '/alpha' });
  await alpha.getByRole('button', { name: 'Edit' }).click();
  assert.match(await rt.innerHTML(), /<strong>Hello world<\/strong>/);
  assert.equal(await p.getByRole('combobox', { name: 'author' }).inputValue() !== '', true);
  await rt.click(); await p.keyboard.press('Control+A'); await p.keyboard.type('Changed text');
  await p.getByRole('button', { name: 'Save changes' }).click(); await p.getByText('Alpha').first().waitFor();
  await alpha.getByRole('button', { name: /History of alpha/ }).click();
  await p.getByRole('heading', { name: 'History of /alpha' }).waitFor();
  await p.getByRole('button', { name: 'Restore' }).first().click();
  await alpha.getByRole('button', { name: 'Edit' }).click();
  await p.waitForFunction(() => /Hello world/.test(document.querySelector('[role=textbox][aria-label="body"]')?.innerHTML ?? ''));
  assert.doesNotMatch(await rt.innerHTML(), /Changed text/);
  await p.getByRole('button', { name: 'Cancel' }).click();
  // Editor: filtered repeater + a reference-path binding
  await p.goto(`http://localhost:3100/editor/${pid}`);
  const frame = p.frameLocator('iframe');
  await p.getByRole('button', { name: 'Container', exact: true }).click();
  await p.getByRole('button', { name: 'Heading 2', exact: true }).click();
  await p.getByRole('tab', { name: 'navigator' }).click();
  await p.locator('[role=treeitem] > div', { hasText: /^div/ }).first().click();
  await p.getByLabel('Repeat collection').selectOption({ label: 'Posts' });
  await p.locator('[role=treeitem] > div', { hasText: /^h2/ }).first().click();
  await p.getByLabel('Binding collection').selectOption({ label: 'Posts' });
  await p.getByLabel('Binding field').selectOption('author.name');
  await frame.locator('h2').first().waitFor();
  await frame.getByText('Ada').first().waitFor();                       // Alpha's author
  await p.locator('[role=treeitem] > div', { hasText: /^div/ }).first().click();
  await p.getByRole('button', { name: 'Add filter' }).click();
  await p.getByLabel('Filter 1 field').selectOption('title');
  const val = p.getByLabel('Filter 1 value'); await val.fill('Beta'); await val.blur();
  for (let n = 0; n < 40 && (await frame.locator('h2').count()) !== 1; n++) await p.waitForTimeout(200);   // the canvas is sandboxed, so poll through the frame locator
  assert.deepEqual(await frame.locator('h2').allInnerTexts(), ['Heading']);   // Beta has no author → static fallback text stays
  await p.getByLabel('Binding collection').count();
  await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved', null, { timeout: 8000 });
  assert.deepEqual(errs, []);
  console.log('cms2 ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
