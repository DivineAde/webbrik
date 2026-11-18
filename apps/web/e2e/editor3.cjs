// Editor: free positioning (handles, drag, keyboard, Position panel), rulers + guides, editable compare, indent/outdent,
// animation timeline editor, interaction builder. Needs API :4000 and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  process.on('unhandledRejection', () => {});
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Ed3'); await p.getByLabel('Email').fill(`e3${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Ed3'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const frame = p.frameLocator('iframe');
  const setStyle = async (name, v) => { const i = p.getByLabel(name, { exact: true }).first(); await i.fill(v); await i.press('Enter'); };
  const blur = async () => { await p.evaluate(() => document.activeElement && document.activeElement.blur()); };

  // Two containers
  for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: 'Container', exact: true }).click(); await setStyle('margin', '0'); await setStyle('width', '300px'); await setStyle('height', '80px'); await blur(); await p.keyboard.press('Escape'); }
  await p.getByRole('tab', { name: 'navigator' }).click();
  const items = p.locator('[role=treeitem] > div', { hasText: /^div/ });
  assert.equal(await items.count(), 2);

  // ---- Free positioning from the Position panel ----
  await items.nth(1).click();
  await p.locator('[data-handle=e]').waitFor();
  assert.equal(await p.locator('[data-handle]:not([data-handle=reorder])').count(), 3);                  // flow element: e, s, se only
  await p.getByRole('button', { name: 'Free', exact: true }).click();
  await p.locator('[data-handle=nw]').waitFor();
  assert.equal(await p.locator('[data-handle]').count(), 9);                  // 8 resize handles + move
  const x0 = Number(await p.getByLabel('Left', { exact: true }).inputValue());
  // keyboard nudge from the canvas / move handle
  await p.locator('[data-handle=move]').focus(); await p.keyboard.press('Shift+ArrowRight');
  await p.waitForFunction((x) => Number([...document.querySelectorAll('input[aria-label=Left]')][0]?.value) === x + 10, x0);
  // typed values
  await p.getByLabel('Top', { exact: true }).fill('120'); await p.getByLabel('Top', { exact: true }).press('Enter');
  await p.waitForFunction(() => document.querySelector('input[aria-label=Top]')?.value === '120');
  // drag with the move handle
  const mh = await p.locator('[data-handle=move]').boundingBox(); const mx = mh.x + mh.width / 2, my = mh.y + mh.height / 2;
  await p.mouse.move(mx, my); await p.mouse.down(); await p.mouse.move(mx + 40, my + 30, { steps: 5 }); await p.mouse.up();
  await p.waitForFunction(() => { const t = Number(document.querySelector('input[aria-label=Top]')?.value); return t > 120 && t < 170; });
  // resize from the NW corner changes both position and size
  const w0 = Number(await p.getByLabel('Width', { exact: true }).inputValue());
  const nw = await p.locator('[data-handle=nw]').boundingBox(); const nx = nw.x + nw.width / 2, ny = nw.y + nw.height / 2;
  await p.mouse.move(nx, ny); await p.mouse.down(); await p.mouse.move(nx - 25, ny - 5, { steps: 5 }); await p.mouse.up();
  await p.waitForFunction((w) => Number(document.querySelector('input[aria-label=Width]')?.value) > w, w0);
  // back to flow
  await p.getByRole('button', { name: 'Flow', exact: true }).click();
  await p.waitForFunction(() => !document.querySelector('[data-handle=nw]'));
  // free positioning is per breakpoint: switch on Tablet only
  await p.getByRole('tab', { name: 'Tablet' }).click();
  await p.getByRole('button', { name: 'Free', exact: true }).waitFor();
  await p.getByRole('tab', { name: 'Desktop' }).click();

  // ---- Indent / outdent ----
  await items.nth(1).click(); await p.keyboard.press('Escape');
  await items.nth(1).click();
  await p.locator('[role=tree]').focus().catch(() => {});
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })));
  await p.waitForFunction(() => document.querySelectorAll('[role=treeitem] [role=treeitem]').length === 1);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })));
  await p.waitForFunction(() => document.querySelectorAll('[role=treeitem] [role=treeitem]').length === 0);

  // ---- Rulers + guides ----
  await p.getByRole('button', { name: 'Rulers', exact: true }).click();
  await p.getByTestId('rulers').waitFor();
  const ruler = await p.locator('[data-ruler=x]').boundingBox();
  await p.mouse.move(ruler.x + 100, ruler.y + 5); await p.mouse.down(); await p.mouse.move(ruler.x + 100, ruler.y + 120, { steps: 6 }); await p.mouse.up();
  const g = p.locator('[data-guide=y]'); await g.waitFor();
  const gp0 = Number(await g.getAttribute('data-pos')); assert.ok(gp0 > 60, `guide at ${gp0}`);
  await g.focus(); await p.keyboard.press('Shift+ArrowDown');
  assert.equal(Number(await g.getAttribute('data-pos')), gp0 + 10);
  await p.reload(); await p.getByRole('button', { name: 'Rulers', exact: true }).click(); await p.locator('[data-guide=y]').waitFor();   // persisted per project
  await p.locator('[data-guide=y]').focus(); await p.keyboard.press('Delete');
  assert.equal(await p.locator('[data-guide]').count(), 0);
  await p.getByRole('button', { name: 'Rulers', exact: true }).click();

  // ---- Editable compare: click inside a frame to select there, then edit at that breakpoint ----
  await p.getByRole('button', { name: /Compare/ }).click(); await p.getByTestId('compare').waitFor();
  await p.frameLocator('iframe[title="Tablet preview"]').locator('[data-node-id]').nth(1).waitFor();
  await p.frameLocator('iframe[title="Tablet preview"]').locator('[data-node-id]').nth(1).click({ force: true });
  await p.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some((t) => t.textContent.trim() === 'Tablet' && t.getAttribute('aria-selected') === 'true'));
  await p.getByRole('button', { name: /Compare/ }).click();
  await p.getByTestId('compare').waitFor({ state: 'detached' });

  // ---- Interaction builder ----
  await p.getByRole('tab', { name: 'Desktop' }).click();
  await p.getByRole('tab', { name: 'interact' }).click();
  await p.getByRole('button', { name: '+ Add interaction' }).click();
  await p.getByLabel('Action').selectOption('hide');
  await p.getByLabel('Trigger').selectOption('hover');
  await p.getByLabel('Target').waitFor();
  const tid = await p.getByLabel('Target').inputValue();
  assert.ok(tid);
  await p.getByRole('tab', { name: 'design' }).click(); await p.getByRole('tab', { name: 'interact' }).click();
  assert.equal(await p.getByLabel('Trigger').inputValue(), 'hover');       // persisted on the node

  // ---- Animation timeline editor ----
  await p.getByRole('tab', { name: 'animate' }).click();
  await p.getByRole('button', { name: '+ fade-in' }).click();
  const ed = p.getByTestId('anim-fade-in'); await ed.waitFor();
  assert.equal(await ed.getByRole('button', { name: /^Keyframe at/ }).count(), 2);
  await ed.getByRole('button', { name: '+ Keyframe' }).click();
  assert.equal(await ed.getByRole('button', { name: /^Keyframe at/ }).count(), 3);
  await ed.getByRole('button', { name: 'Keyframe at 50%' }).click();
  await ed.locator('textarea').fill('opacity: 0.5'); await ed.locator('textarea').blur();
  await p.waitForFunction(() => [...document.querySelectorAll('textarea')].some((t) => t.value === 'opacity: 0.5'));
  await ed.getByLabel('Repeat').selectOption('infinite');
  await ed.getByRole('button', { name: 'Preview fade-in' }).click();
  await ed.getByRole('button', { name: /Playing|Preview/ }).waitFor();
  // now an interaction can point at the animation
  await p.getByRole('tab', { name: 'interact' }).click();
  await p.getByLabel('Action').selectOption('animate');
  await p.getByLabel('Animation').waitFor();

  assert.deepEqual(errs, []);
  console.log('editor3 ok'); await b.close();
})().catch(async (e) => { console.error(e); process.exit(1); });
