// The app asks for confirmation with an accessible dialog (role=alertdialog), not window.confirm.
// Suites that don't care about the dialog itself call autoConfirm(page): a MutationObserver inside the page presses
// "Confirm" whenever such a dialog appears (works even while the test is waiting on navigation, unlike locator handlers).
exports.autoConfirm = (page) => page.addInitScript(() => {
  const press = () => { const d = document.querySelector('[role=alertdialog]'); const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Confirm' || x.textContent.trim() === 'Delete'); if (b) setTimeout(() => b.click(), 50); };
  new MutationObserver(press).observe(document, { childList: true, subtree: true });
});
