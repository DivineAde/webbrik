// Sign out of one account and into a brand new one without reloading: the dashboard must not show the old workspace's data or "Workspace not found".
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  require('./auto-confirm.cjs').autoConfirm(p);
  const signup = async (name) => {
    await p.goto('http://localhost:3100/login');
    await p.getByRole('button', { name: /Need an account/ }).click();
    await p.getByLabel('Name').fill(name); await p.getByLabel('Email').fill(`${name.replace(/\W/g, '')}${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
    await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  };
  await signup('First Person');
  await p.getByRole('button', { name: 'New project' }).first().click().catch(() => {});
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Account menu' }).click(); await p.getByRole('menuitem', { name: /Sign out/ }).click(); await p.waitForURL('**/login');
  // Second account in the same tab, client-side navigation only
  await p.getByRole('button', { name: /Need an account/ }).click();
  await p.getByLabel('Name').fill('Second Person'); await p.getByLabel('Email').fill(`second${Date.now()}@example.com`); await p.getByLabel('Password').fill('correct horse battery staple');
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL('**/dashboard');
  await p.waitForTimeout(1500);
  const bad = await p.getByText(/Workspace not found/i).count();
  const who = await p.getByText('Second Person').count();
  console.log('not-found messages:', bad, '| shows second account:', who > 0);
  if (bad) process.exit(1);
  await b.close();
})();
