// DnD / multi-select / text-edit browser test. Same setup as smoke.cjs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/editor');
  const frame = p.frameLocator('iframe');
  const add = async (name) => { await p.getByRole('button', { name, exact: true }).click(); await p.keyboard.press('Escape'); };
  await add('Heading 1'); await add('Paragraph'); await add('Button');
  await p.getByRole('tab', { name: 'navigator' }).click();
  const rows = () => p.locator('[role=treeitem] > div').allInnerTexts();
  const names = async () => (await rows()).map((t) => t.split('\n')[0].trim());
  assert.deepEqual(await names(), ['h1', 'p', 'button']);
  // Reorder via drag in the layers tree: drop h1 on the lower edge of button
  const h1 = p.locator('[role=treeitem] > div', { hasText: 'h1' }), btn = p.locator('[role=treeitem] > div', { hasText: 'button' });
  const bb = await btn.boundingBox();
  await h1.dragTo(btn, { targetPosition: { x: 20, y: bb.height - 2 } });
  assert.deepEqual(await names(), ['p', 'button', 'h1']);
  // Multi-select with shift, delete both
  await p.getByRole('button', { name: 'p', exact: true }).click();
  await p.getByRole('button', { name: 'button', exact: true }).click({ modifiers: ['Shift'] });
  await p.keyboard.press('Delete');
  assert.deepEqual(await names(), ['h1']);
  await p.keyboard.press('Control+z');
  assert.equal((await names()).length, 3);
  // Drag an element from the library onto the canvas heading's top edge
  await p.getByRole('tab', { name: 'elements' }).click();
    await p.getByRole('button', { name: 'Heading 2', exact: true }).dragTo(frame.locator('h1'), { targetPosition: { x: 700, y: 2 } });
  await p.getByRole('tab', { name: 'navigator' }).click();
  assert.equal((await names()).filter((n) => n === 'Heading 2').length, 1, 'h2 inserted by canvas drop');
  // Direct text editing
  await frame.locator('h1').dblclick();
  await p.keyboard.press('Control+a'); await p.keyboard.type('Edited on canvas'); await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  assert.equal(await frame.locator('h1').innerText(), 'Edited on canvas');
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
  assert.equal(await frame.locator('h1').innerText(), 'Heading');
  assert.deepEqual(errs, []);
  console.log('dnd ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
