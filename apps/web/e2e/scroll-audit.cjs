// Every signed-in page and project tab: only <main> may scroll (no page scroll, no nested scrollers taller than their content wanted), sidebar fits.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: Number(process.env.H || 720) } })).newPage();
  await p.goto('http://localhost:3100/login'); await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Aud'); await p.getByLabel('Email').fill(`sa${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Aud'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/(.+)/);
  const pid = p.url().split('/editor/')[1];
  const ws = await p.evaluate(async () => (await (await fetch('/api/v1/workspaces')).json()).workspaces?.[0]?.id);
  const report = [];
  const check = async (label) => {
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const de = document.documentElement; const out = { pageScroll: de.scrollHeight > innerHeight + 1, hscroll: de.scrollWidth > innerWidth + 1, scrollers: [] };
      for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) out.scrollers.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : '')); }
      const aside = document.querySelector('aside > div'); out.sidebarOverflow = aside ? aside.scrollHeight > aside.clientHeight + 1 : null; return out;
    });
    report.push({ label, ...r }); 
  };
  await p.goto('http://localhost:3100/dashboard'); await check('dashboard');
  await p.goto(`http://localhost:3100/workspaces/${ws}`); await check('workspace');
  for (const t of ['Members', 'Usage', 'Plan']) { const tab = p.getByRole('tab', { name: new RegExp(t, 'i') }); if (await tab.count()) { await tab.first().click(); await check('workspace:' + t); } }
  await p.goto('http://localhost:3100/settings'); await check('settings'); await p.goto('http://localhost:3100/help'); await check('help');
  for (const t of ['Publish', 'Content', 'Forms', 'Assets', 'Versions', 'Comments', 'Settings']) { await p.goto(`http://localhost:3100/projects/${pid}?tab=${t}`); await check('project:' + t); }
  for (const r of report) console.log(JSON.stringify(r));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
