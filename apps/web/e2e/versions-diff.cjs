// Visual version diff: save a version, change the page, compare. Both versions render side by side with the changes outlined.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3100/login'); await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('VD'); await p.getByLabel('Email').fill(`vd${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Diff'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/editor/')[1].split(/[?#]/)[0];
  const api = (path, method = 'GET', data) => p.request.fetch(`http://localhost:3100/api${path}`, { method, headers: { 'x-requested-with': 'webbrik', 'content-type': 'application/json' }, data });
  const node = (id, parentId, tag, text) => ({ id, type: 'element', tag, children: [], attributes: {}, classIds: [], styles: [], hidden: false, locked: false, props: {}, interactions: [], parentId, ...(text ? { text } : {}) });
  const doc = async () => (await (await api(`/projects/${pid}/document`)).json());
  let d = await doc(); const root = d.document.pages[0].rootId;
  const commit = async (ops, id) => { d = await doc(); const r = await api(`/projects/${pid}/ops`, 'POST', { id, clientId: 'e2e', baseRevision: d.revision, ops }); assert.ok(r.ok(), await r.text()); };
  await commit([{ type: 'insertSubtree', rootId: 'h1', nodes: [node('h1', root, 'h1', 'Welcome')], parentId: root, index: 0 }, { type: 'insertSubtree', rootId: 'p1', nodes: [node('p1', root, 'p', 'Old paragraph')], parentId: root, index: 1 }], 't1');
  assert.ok((await api(`/projects/${pid}/versions`, 'POST', { name: 'Before launch' })).ok());
  // change: edit text, add a new element, delete one
  await commit([{ type: 'updateElement', id: 'h1', patch: { text: 'Welcome to Diff' } }, { type: 'insertSubtree', rootId: 'b1', nodes: [node('b1', root, 'button', 'Sign up')], parentId: root, index: 2 }, { type: 'deleteElement', id: 'p1' }], 't2');

  await p.goto(`http://localhost:3100/projects/${pid}?tab=Versions`);
  await p.getByRole('button', { name: 'Compare to current' }).click();
  const vd = p.getByTestId('visual-diff'); await vd.waitFor();
  const before = p.frameLocator('iframe[title="Before version"]'), after = p.frameLocator('iframe[title="Now version"]');
  await before.getByText('Old paragraph').waitFor(); await after.getByText('Sign up').waitFor();
  assert.equal(await after.getByText('Old paragraph').count(), 0);                 // really different documents, rendered for real
  assert.equal(await before.getByText('Sign up').count(), 0);
  // highlights: removed in "before" (red), added in "after" (green), edited text amber on both sides
  const outline = (fl, sel) => fl.locator(sel).evaluate((el) => getComputedStyle(el).outlineColor);
  assert.equal(await outline(before, '[data-node-id="p1"]'), 'rgb(220, 38, 38)');
  assert.equal(await outline(after, '[data-node-id="b1"]'), 'rgb(22, 163, 74)');
  assert.equal(await outline(after, '[data-node-id="h1"]'), 'rgb(217, 119, 6)');
  assert.match(await vd.innerText(), /1 added · 1 removed · \d+ changed/);
  await vd.getByRole('list', { name: 'Legend' }).waitFor();
  // toggling closes it
  await p.getByRole('button', { name: 'Compare to current' }).click(); await vd.waitFor({ state: 'detached' });
  assert.deepEqual(errs, []);
  console.log('versions-diff ok'); await b.close();
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
