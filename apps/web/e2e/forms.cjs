// Form builder → editor connect/generate → published page posts cross-origin → submissions tab; plus paginated list on the same page.
// Needs the API started with PUBLIC_API_URL=http://localhost:4000 (see run.sh) and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessPermissionPrompt,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'] });
  /* the fake site origin is not loopback to Chromium; real sites call a public API */
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Forms'); await p.getByLabel('Email').fill(`f${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Forms site'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/').pop();
  const call = (method, path, body) => p.evaluate(async ([m, u, bd]) => { const r = await fetch('/api' + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'webbrik' }, body: bd ? JSON.stringify(bd) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; }, [method, path, body]);

  // 1. Form builder in the project area
  await p.goto(`http://localhost:3100/projects/${pid}?tab=Forms`);
  await p.getByRole('tab', { name: 'Forms', selected: true }).waitFor();    // ?tab= opens the tab (used by notification emails)
  await p.getByLabel('New form id').fill('contact'); await p.getByRole('button', { name: 'Create form' }).click();
  await p.getByLabel('Field 3 name').waitFor();
  await p.getByLabel('Success message').fill('Received, thanks!');
  await p.getByLabel(/Email each submission/).fill('owner@example.com');
  await p.getByRole('button', { name: 'Save form' }).click();
  await p.getByText(/Saved\. Publish again/).waitFor();
  // invalid redirect is refused by the server and shown
  await p.getByLabel(/Redirect to/).fill('javascript:alert(1)'); await p.getByRole('button', { name: 'Save form' }).click();
  await p.locator('[role=alert]:not(:empty)').first().waitFor({ timeout: 8000 });
  await p.getByLabel(/Redirect to/).fill('');

  // 2. A collection with 5 posts and a paginated list (2 per page), prepared through the API
  const col = (await call('POST', `/projects/${pid}/collections`, { slug: 'posts', name: 'Posts', fields: [{ name: 'title', type: 'text', required: true }] })).data.collection;
  for (let i = 1; i <= 5; i++) await call('POST', `/projects/${pid}/collections/${col.id}/items`, { slug: `post-${i}`, data: { title: `Post ${i}` }, status: 'published' });
  const head = (await call('GET', `/projects/${pid}/document`)).data; const root = head.document.pages[0].rootId;
  const n = (id, parentId, tag, extra = {}) => ({ id, parentId, tag, type: 'element', children: [], classIds: [], styles: [], attributes: {}, props: {}, interactions: [], ...extra });
  const ops = await call('POST', `/projects/${pid}/ops`, { id: 'o1', clientId: 'e2e', baseRevision: head.revision, ops: [
    { type: 'insertSubtree', rootId: 'ul1', parentId: root, index: 0, nodes: [n('ul1', root, 'ul', { props: { repeat: col.id, repeatPageSize: 2 }, children: ['li1'] }), n('li1', 'ul1', 'li', { text: 'x', binding: { collectionId: col.id, field: 'title', target: 'text' } })] },
  ] });
  assert.equal(ops.status, 201);

  // 3. Editor: add a Form, connect it, generate its fields
  await p.goto(`http://localhost:3100/editor/${pid}`);
  const frame = p.frameLocator('iframe');
  await p.getByRole('button', { name: 'Form', exact: true }).click();
  await p.getByLabel('Connected form').selectOption('contact');
  await p.getByRole('button', { name: 'Generate fields' }).click();
  await frame.locator('input[name=email]').waitFor();
  await frame.locator('textarea[name=message]').waitFor();
  await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved', null, { timeout: 8000 });

  // 4. "Publish": export the static site and open it on a different origin. Its form posts cross-origin to the API.
  const out = (await call('GET', `/projects/${pid}/export?target=static&format=json`)).data;
  assert.ok(out.files['assets/interactions.js'].includes('http://localhost:4000'));
  const site = await ctx.newPage(); const siteErrs = []; site.on('pageerror', e => siteErrs.push(e.message));
  await site.route('http://localhost:3199/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    const body = out.files[file];
    if (body === undefined) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body });
  });
  await site.goto('http://localhost:3199/');
  // pagination: 5 items, 2 per page
  const items = site.locator('li[data-wb-item]');
  assert.equal(await items.count(), 5);
  await site.getByText('Page 1 of 3').waitFor();
  assert.equal(await items.filter({ visible: true }).count(), 2);
  await site.getByRole('button', { name: 'Next' }).click(); await site.getByRole('button', { name: 'Next' }).click();
  await site.getByText('Page 3 of 3').waitFor();
  assert.deepEqual(await items.filter({ visible: true }).allInnerTexts(), ['Post 5']);
  assert.ok(await site.getByRole('button', { name: 'Next' }).isDisabled());
  // submit: invalid first (required name/email), then valid
  await site.getByRole('button', { name: 'Send' }).click();
  assert.equal(await site.locator('[data-wb-form-status]').count(), 0);        // native validation stops it before any request
  await site.locator('input[name=name]').fill('Ada'); await site.locator('input[name=email]').fill('ada@example.com'); await site.locator('textarea[name=message]').fill('Hello from the site');
  await site.getByRole('button', { name: 'Send' }).click();
  await site.getByText('Received, thanks!').waitFor({ timeout: 8000 });
  assert.equal(await site.locator('input[name=email]').inputValue(), '');      // form reset
  assert.deepEqual(siteErrs, []);

  // 5. Submission shows up in the project, can be exported and deleted
  await p.goto(`http://localhost:3100/projects/${pid}?tab=Forms`);
  await p.getByRole('tab', { name: /contact · 1/ }).waitFor();
  await p.getByText('Hello from the site').waitFor();
  await p.getByRole('link', { name: 'Download CSV' }).waitFor();
  await p.getByRole('button', { name: /Delete submission/ }).click();
  await p.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await p.getByText(/Nothing yet/).waitFor();
  assert.deepEqual(errs, []);
  console.log('forms ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
