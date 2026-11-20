// Every export target downloads a zip with the right shape, from the Publish tab, the editor menu and the local editor.
const { chromium } = require('playwright');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const names = (zip) => execFileSync('unzip', ['-Z1', zip]).toString().split('\n').filter(Boolean);
  const grab = async (click, label) => { const [d] = await Promise.all([p.waitForEvent('download'), click()]); const f = `/tmp/${label}.zip`; await d.saveAs(f); return names(f); };
  // local editor
  await p.goto('http://localhost:3100/editor'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Export' }).click();
  let files = await grab(() => p.getByRole('menuitem', { name: /^Next\.js project/ }).click(), 'local-next');
  assert(files.some((f) => /package\.json$/.test(f)) && files.some((f) => /\.tsx$/.test(f)), 'local next export has package.json and tsx: ' + files.join());
  // account + project
  await p.goto('http://localhost:3100/login'); await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Export Test'); await p.getByLabel('Email').fill(`exp${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.getByRole('button', { name: 'New project' }).first().click(); await p.getByLabel('Project name').fill('Export site'); await p.getByRole('button', { name: 'Create project' }).click(); await p.waitForURL(/\/editor\/(.+)/);
  const id = p.url().split('/editor/')[1];
  await p.getByRole('tab', { name: 'templates' }).click(); await p.getByRole('button', { name: /^Hero/ }).click(); await p.waitForTimeout(1500);
  // editor menu
  await p.getByRole('button', { name: 'Main menu' }).click(); await p.getByRole('menuitem', { name: /Export code/ }).click();
  files = await grab(() => p.getByRole('menuitem', { name: /^Vite project/ }).click(), 'menu-vite');
  assert(files.some((f) => /vite\.config/.test(f)), 'vite export has vite.config: ' + files.join());
  // publish tab
  await p.goto(`http://localhost:3100/projects/${id}?tab=Publish`);
  files = await grab(() => p.getByRole('button', { name: /Next\.js project/ }).click(), 'tab-next');
  assert(files.some((f) => /next\.config/.test(f)), 'next export has next.config: ' + files.join());
  files = await grab(() => p.getByRole('button', { name: /Static site/ }).click(), 'tab-static');
  assert(files.some((f) => /index\.html$/.test(f)), 'static export has index.html');
  console.log('export ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
