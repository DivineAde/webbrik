// UI kit behaviour in a real browser: keyboard operation, focus handling, ARIA roles, and an axe audit of the reference page.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3100/ui-kit');
  const log = () => p.getByTestId('kit-log').innerText();

  // Dialog: opens, traps focus, Esc closes and focus returns to the trigger
  const dt = p.getByRole('button', { name: 'Open dialog' }); await dt.click();
  const dlg = p.getByRole('dialog', { name: 'Invite a teammate' }); await dlg.waitFor();
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); assert.ok(await p.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'focus escaped the dialog'); }
  await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' });
  await p.waitForFunction(() => document.activeElement && document.activeElement.textContent === 'Open dialog');

  // Dropdown: keyboard open, arrow, Enter
  await p.getByRole('button', { name: 'Menu' }).focus(); await p.keyboard.press('Enter');
  await p.getByRole('menu').waitFor(); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  assert.match(await log(), /menu:/);

  // Tabs: arrow keys move and select
  await p.getByRole('tab', { name: 'Overview' }).focus(); await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Activity')?.getAttribute('aria-selected') === 'true'); await p.getByText('Activity content').waitFor();

  // Switch + checkbox: Space toggles, labels are associated
  await p.getByRole('switch', { name: 'Email me about deploys' }).focus(); await p.keyboard.press('Space');
  await p.waitForFunction(() => document.querySelector('#kit-sw').getAttribute('aria-checked') === 'true');
  await p.getByRole('checkbox', { name: 'I agree' }).focus(); await p.keyboard.press('Space');
  await p.waitForFunction(() => document.querySelector('#kit-ck').getAttribute('aria-checked') === 'true');

  // Select: keyboard
  await p.getByRole('combobox', { name: 'Plan' }).focus(); await p.keyboard.press('Enter');
  await p.getByRole('option', { name: 'Team' }).click(); assert.match(await log(), /plan:team/);

  // Tooltip on keyboard focus
  await p.waitForTimeout(400); await p.getByRole('button', { name: 'Hover me' }).focus(); await p.getByRole('tooltip').first().waitFor({ timeout: 8000 }).catch(async () => { await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab'); await p.getByRole('tooltip').first().waitFor(); });

  // Confirm dialog: Cancel and Esc resolve false, Delete resolves true
  const cd = p.getByRole('button', { name: 'Confirm dialog' });
  await cd.click(); await p.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click(); await p.waitForFunction(() => /confirm:false/.test(document.querySelector('[data-testid=kit-log]').textContent));
  await cd.click(); await p.getByRole('alertdialog').waitFor(); await p.keyboard.press('Escape');
  await p.waitForFunction(() => (document.querySelector('[data-testid=kit-log]').textContent.match(/confirm:false/g) || []).length === 2);
  await cd.click(); await p.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click(); await p.waitForFunction(() => /confirm:true/.test(document.querySelector('[data-testid=kit-log]').textContent));

  // axe: page, and with the overlays open
  await p.addScriptTag({ content: AXE });
  const run = () => p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] }).then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)));
  assert.deepEqual(await run(), []);
  await dt.click(); await p.getByRole('dialog').waitFor(); assert.deepEqual(await run(), []); await p.keyboard.press('Escape');
  await cd.click(); await p.getByRole('alertdialog').waitFor(); assert.deepEqual(await run(), []);
  assert.deepEqual(errs, []);
  console.log('uikit ok'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
