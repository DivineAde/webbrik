// Editor: resizable panels, resize handles with snapping guides, side-by-side breakpoint compare, asset picker. Needs API :4000 and web :3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/login');
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Ed2'); await p.getByLabel('Email').fill(`e2${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Ed2'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
  const frame = p.frameLocator('iframe');
  const aside = p.getByLabel('Left sidebar');

  // ---- Resizable panels: keyboard, pointer, reset, persistence ----
  const sep = p.getByRole('separator', { name: 'Resize left panel' });
  assert.equal(await sep.getAttribute('aria-valuenow'), '288');
  await sep.focus(); await p.keyboard.press('ArrowRight');
  assert.equal(await sep.getAttribute('aria-valuenow'), '304');
  assert.equal(Math.round((await aside.boundingBox()).width), 304);
  const sb = await sep.boundingBox();
  await p.mouse.move(sb.x + 2, sb.y + 200); await p.mouse.down(); await p.mouse.move(sb.x + 2 + 60, sb.y + 200, { steps: 5 }); await p.mouse.up();
  assert.equal(await sep.getAttribute('aria-valuenow'), '364');
  await p.reload(); await p.getByRole('separator', { name: 'Resize left panel' }).waitFor();
  assert.equal(await p.getByRole('separator', { name: 'Resize left panel' }).getAttribute('aria-valuenow'), '364');   // persisted
  await p.getByRole('separator', { name: 'Resize left panel' }).dblclick();
  assert.equal(await p.getByRole('separator', { name: 'Resize left panel' }).getAttribute('aria-valuenow'), '288');
  const rsep = p.getByRole('separator', { name: 'Resize right panel' }); await rsep.focus(); await p.keyboard.press('ArrowLeft');
  assert.equal(await rsep.getAttribute('aria-valuenow'), '320');   // right panel grows when its edge moves left
  await rsep.dblclick();

  // ---- Resize handles, snapping and guides ----
  const setStyle = async (name, v) => { const i = p.getByLabel(name, { exact: true }).first(); await i.fill(v); await i.press('Enter'); };
  await p.getByRole('button', { name: 'Container', exact: true }).click();
  await setStyle('margin', '0'); await setStyle('width', '400px'); await setStyle('height', '60px');
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Container', exact: true }).click();
  await setStyle('margin', '0'); await setStyle('width', '700px'); await setStyle('height', '60px');
  await p.getByRole('tab', { name: 'navigator' }).click();
  await p.locator('[role=treeitem] > div', { hasText: /^div/ }).first().click();
  await p.getByRole('button', { name: 'Main menu' }).click(); await p.getByRole('menuitem', { name: 'View' }).click(); await p.getByRole('menuitem', { name: /Actual size/ }).click();   // drags below are measured at 100%
  const handle = p.locator('[data-handle=e]'); await handle.waitFor();
  const hb = await handle.boundingBox(); const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 150, cy, { steps: 4 }); await p.mouse.move(cx + 297, cy, { steps: 4 });   // 400 + 297 = 697 → within 6px of the sibling's 700
  await p.getByTestId('snap-guide').first().waitFor();
  assert.match(await p.getByRole('status').filter({ hasText: '×' }).innerText(), /^700 × 60/);
  await p.mouse.up();
  await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '700px' && i.getAttribute('aria-label') === 'width'));
  assert.equal(await p.getByTestId('snap-guide').count(), 0);
  // keyboard resize from the handle, and free (unsnapped) resize
  await handle.focus(); await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '701px' && i.getAttribute('aria-label') === 'width'));
  const sh = p.locator('[data-handle=s]'); await sh.focus(); await p.keyboard.press('Shift+ArrowDown');
  await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '70px' && i.getAttribute('aria-label') === 'height'));
  // the size is saved at the current breakpoint only
  await p.getByRole('tab', { name: 'Tablet' }).click();
  assert.equal(await p.getByLabel('width', { exact: true }).first().inputValue(), '');
  await p.getByRole('tab', { name: 'Desktop' }).click();

  // ---- Side-by-side breakpoint compare ----
  const compare = p.getByRole('button', { name: /Compare/ }); await compare.click();
  await p.getByTestId('compare').waitFor();
  assert.equal(await p.locator('iframe[title$="preview"]').count(), 3);
  assert.deepEqual(await p.locator('figcaption span.font-medium').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, '').replace(/editing$/, ''))), ['Desktop1280px', 'Tablet991px', 'Mobile479px']);
  await p.getByRole('button', { name: 'Full view' }).nth(1).click();
  await p.getByTestId('compare').waitFor({ state: 'detached' });
  assert.equal(await p.getByRole('tab', { name: 'Tablet' }).getAttribute('aria-selected'), 'true');
  await p.getByRole('tab', { name: 'Desktop' }).click();

  // ---- Asset picker: upload from the dialog, the image lands in the canvas ----
  await p.getByRole('tab', { name: 'elements' }).click();
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Image', exact: true }).click();
  await p.getByRole('button', { name: /Choose from assets/ }).click();
  const dlg = p.getByRole('dialog', { name: 'Choose an image' }); await dlg.waitFor();
  await dlg.getByText(/No images yet/).waitFor();
  await dlg.getByLabel('Upload images').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await dlg.waitFor({ state: 'detached' });
  assert.match(await p.getByLabel('Image source').inputValue(), /^asset:/);
  await frame.locator('img').last().waitFor();
  await p.waitForFunction(() => true);
  for (let i = 0; i < 40 && !(await frame.locator('img').last().getAttribute('src'))?.startsWith('data:image/png'); i++) await p.waitForTimeout(200);
  assert.match(await frame.locator('img').last().getAttribute('src'), /^data:image\/png/);
  // picking an existing asset the second time
  await p.getByLabel('Image source').fill('https://example.com/x.png'); await p.getByLabel('Image source').blur();
  await p.getByRole('button', { name: /Choose from assets/ }).click();
  await p.getByRole('button', { name: 'Use dot.png' }).click(); await dlg.waitFor({ state: 'detached' });
  assert.match(await p.getByLabel('Image source').inputValue(), /^asset:/);
  await p.getByLabel('Image alt text').fill('A dot'); await p.getByLabel('Image alt text').blur();
  await p.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved', null, { timeout: 8000 });
  assert.deepEqual(errs, []);
  console.log('editor2 ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
