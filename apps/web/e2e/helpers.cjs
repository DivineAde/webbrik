// Shared helpers for UI changes: right-panel overflow tabs, account menu.
const RIGHT_MORE = { ai: 'AI assistant', quality: 'Quality checks', code: 'Custom code', history: 'History', help: 'Help and shortcuts' };
async function openRight(p, name) {
  const key = String(name).toLowerCase();
  if (RIGHT_MORE[key]) {
    await p.getByRole('button', { name: 'More panels' }).click();
    await p.getByRole('menuitemradio', { name: RIGHT_MORE[key] }).click();
  } else await p.getByRole('tablist', { name: 'Right panel' }).getByRole('tab', { name }).click();
}
async function signOut(p) {
  await p.getByRole('button', { name: 'Account menu' }).click();
  await p.getByRole('menuitem', { name: 'Sign out' }).click();
}
module.exports = { openRight, signOut };
