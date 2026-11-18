// Automated accessibility audit (axe-core, WCAG 2.0/2.1 A+AA rules) across the app's real screens, light and dark.
// This catches machine-detectable issues only; it is not a substitute for testing with assistive technology.
const { chromium } = require('playwright');
const { openRight, signOut } = require('./helpers.cjs');
const fs = require('node:fs');
const path = require('node:path');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
(async () => {
  const b = await chromium.launch();
  const results = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme }); const p = await ctx.newPage();
    require('./auto-confirm.cjs').autoConfirm(p);
    const audit = async (name) => {
      await p.waitForTimeout(400);
      await p.evaluate(AXE);
      const r = await p.evaluate((tags) => axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
      // Canvas resize handles are pointer shortcuts on short elements: they can't keep 24px spacing, and every one has a keyboard path
      // (arrow keys on the handle) and an exact alternative (width/height fields in the Design panel). Everything else is held to target-size.
      for (const v of r.violations) { if (v.id === 'target-size') { v.nodes = v.nodes.filter((n) => !/Resize/.test(n.target.join(' '))); if (!v.nodes.length) continue; } results.push({ scheme, screen: name, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 160)), count: v.nodes.length }); }
    };
    await p.goto('http://localhost:3100/login'); await audit('login');
    await p.getByRole('button', { name: /Need an account/ }).click(); await audit('signup');
    await p.getByLabel('Name').fill('A11y'); await p.getByLabel('Email').fill(`a${Date.now()}${scheme}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
    await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard'); await audit('dashboard');
    await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Site'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/.+/);
    const pid = p.url().split('/').pop();
    await p.getByRole('button', { name: 'Container', exact: true }).click(); await p.getByRole('button', { name: 'Heading 1', exact: true }).click();
    await audit('editor-default');
    for (const t of ['navigator', 'pages', 'templates', 'components', 'tokens']) { await p.getByRole('tablist', { name: 'Left panel' }).getByRole('tab', { name: t }).click(); await audit(`editor-left-${t}`); }
    for (const t of ['animate', 'quality', 'code', 'ai', 'history', 'help', 'design']) { await openRight(p, t); await audit(`editor-right-${t}`); }
    await p.getByRole('button', { name: /Compare/ }).click(); await audit('editor-compare'); await p.getByRole('button', { name: /Compare/ }).click();
    await p.keyboard.press('Control+k'); await audit('editor-palette'); await p.keyboard.press('Escape');
    await p.goto(`http://localhost:3100/projects/${pid}`);
    for (const t of await p.getByRole('tab').allInnerTexts()) { await p.getByRole('tab', { name: t, exact: true }).first().click(); await audit(`project-${t.toLowerCase()}`); }
    await p.goto('http://localhost:3100/settings'); await audit('settings');
    await p.goto('http://localhost:3100/dashboard'); await p.getByRole('link', { name: 'Workspace' }).click(); await p.waitForURL(/\/workspaces\/.+/);
    for (const t of await p.getByRole('tab').allInnerTexts()) { await p.getByRole('tab', { name: t, exact: true }).first().click(); await audit(`workspace-${t.toLowerCase().replace(/\W+/g, '-')}`); }
    await ctx.clearCookies(); await p.goto('http://localhost:3100/forgot-password'); await p.getByLabel('Email').waitFor(); await audit('forgot-password');
    await ctx.close();
  }
  await b.close();
  const out = path.join(__dirname, 'a11y-report.json'); fs.writeFileSync(out, JSON.stringify(results, null, 2));
  const byRule = {}; for (const r of results) { const k = `${r.id} (${r.impact})`; (byRule[k] ||= new Set()).add(r.screen); }
  console.log(`${results.length} violation groups`); for (const [k, v] of Object.entries(byRule)) console.log(' -', k, '→', [...v].slice(0, 8).join(', '), v.size > 8 ? `… +${v.size - 8}` : '');
  const bad = results.filter((r) => r.impact === 'serious' || r.impact === 'critical');
  console.log(bad.length ? `FAIL: ${bad.length} serious/critical` : 'a11y ok (no serious/critical violations)');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
