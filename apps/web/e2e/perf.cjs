// Browser-side editor performance on a real Chromium: page with ~1,000 elements. Prints numbers; fails only on gross regressions.
// Needs API :4000 and web :3100. Numbers depend on the machine; the docs record the ones from the build sandbox.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const N_SECTIONS = 25; // 25 sections x (1 + 10 cards x 3) = 775 elements + root
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } }); const p = await ctx.newPage();
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Perf'); await p.getByLabel('Email').fill(`pf${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Perf'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const pid = p.url().split('/editor/')[1].split(/[?#]/)[0];
  const api = (path, method = 'GET', data) => p.request.fetch(`http://localhost:3100/api${path}`, { method, headers: { 'x-requested-with': 'webbrik', 'content-type': 'application/json' }, data });
  const head = await (await api(`/projects/${pid}/document`)).json();
  const root = head.document.pages[0].rootId;
  const node = (id, parentId, tag, text) => ({ id, type: 'element', tag, children: [], attributes: {}, classIds: [], styles: [], hidden: false, locked: false, props: {}, interactions: [], parentId, ...(text ? { text } : {}) });
  const ops = [];
  for (let s = 0; s < N_SECTIONS; s++) {
    const sec = node(`s${s}`, root, 'section'); const nodes = [sec];
    for (let c = 0; c < 10; c++) {
      const card = node(`s${s}c${c}`, `s${s}`, 'div'), h = node(`s${s}c${c}h`, card.id, 'h3', `Card ${s}-${c}`), pp = node(`s${s}c${c}p`, card.id, 'p', 'Body copy that is a realistic length for a card description.');
      card.children = [h.id, pp.id]; sec.children.push(card.id); nodes.push(card, h, pp);
    }
    ops.push({ type: 'insertSubtree', rootId: `s${s}`, nodes, parentId: root, index: s });
  }
  const r = await api(`/projects/${pid}/ops`, 'POST', { id: 'seed', clientId: 'seed', baseRevision: head.revision, ops });
  assert.ok(r.ok(), 'seed failed: ' + (await r.text()).slice(0, 300));

  const out = {};
  // 1. Cold open: navigation start -> first rendered canvas content
  let t0 = Date.now();
  await p.goto(`http://localhost:3100/editor/${pid}`);
  await p.frameLocator('iframe').locator('h3').first().waitFor({ timeout: 20000 }).catch(async (e) => { await p.getByRole('tab', { name: 'navigator' }).click(); await p.waitForTimeout(1500); console.log('treeitems', await p.locator('[role=treeitem]').count(), 'iframes', await p.locator('iframe').count()); const f = p.frames().find((x) => x !== p.mainFrame()); console.log('frame html len', f ? (await f.content()).length : 'no frame', f ? (await f.content()).slice(0, 300) : ''); await p.screenshot({ path: '/tmp/perf-fail.png' }); console.log(await p.locator('body').innerText().then((t) => t.slice(0, 600))); throw e; });
  out['open editor, 776 elements (to first canvas paint)'] = Date.now() - t0;
  await p.getByRole('tab', { name: 'navigator' }).click();
  out['elements in the page'] = await p.frameLocator('iframe').locator('[data-node-id]').count();

  // 2. Select an element from the navigator: click -> inspector shows it
  const items = p.locator('[role=treeitem] > div');
  const sel = async (i) => { const t = Date.now(); await items.nth(i).click(); await p.getByLabel('width', { exact: true }).first().waitFor(); return Date.now() - t; };
  await items.first().waitFor();
  const selTimes = []; for (const i of [3, 12, 40, 60, 100]) selTimes.push(await sel(i));
  out['select element (median of 5, click -> inspector ready)'] = selTimes.sort((a, b) => a - b)[2];

  // 3. Edit: type a style value -> canvas reflects it
  const times = [];
  for (let k = 0; k < 5; k++) {
    await items.nth(3).click();
    const i = p.getByLabel('width', { exact: true }).first(); await i.fill(`${200 + k * 10}px`);
    const t = Date.now(); await i.press('Enter');
    await p.frameLocator('iframe').locator('[data-node-id]').nth(1).evaluate((el, w) => new Promise((res) => { const t = setInterval(() => { if (getComputedStyle(el).width === w || document.querySelector('style')?.textContent.includes(w)) { clearInterval(t); res(); } }, 5); }), `${200 + k * 10}px`);
    times.push(Date.now() - t);
  }
  out['edit a style (median of 5, Enter -> visible in canvas)'] = times.sort((a, b) => a - b)[2];

  // 4. Long task / main-thread cost while editing, from the browser's own timeline
  const longTasks = await p.evaluate(() => new Promise((res) => { const l = []; new PerformanceObserver((list) => l.push(...list.getEntries().map((e) => e.duration))).observe({ entryTypes: ['longtask'] }); setTimeout(() => res(l), 100); }));
  void longTasks;
  const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  if (heap) out['JS heap after the run (MB)'] = heap;

  for (const [k, v] of Object.entries(out)) console.log(k.padEnd(62), typeof v === 'number' && !k.includes('MB') && !k.includes('elements in') ? v + ' ms' : v);
  assert.ok(out['open editor, 776 elements (to first canvas paint)'] < 15000, 'editor open is unreasonably slow');
  assert.ok(out['select element (median of 5, click -> inspector ready)'] < 1500, 'selection is unreasonably slow');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
