import type { Mail } from "./mailer";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Public address of the web app, used to build links in emails. */
export const appUrl = () => (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");

function layout(heading: string, intro: string, button: string, url: string, outro: string): { html: string } {
  return { html: `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e5e5e5;border-radius:12px"><tr><td style="padding:32px">
<p style="margin:0 0 20px;font-weight:600;font-size:15px">Webbrik</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444">${esc(intro)}</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${esc(button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666">Or paste this address into your browser:<br><a href="${esc(url)}" style="color:#666;word-break:break-all">${esc(url)}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#666">${esc(outro)}</p>
</td></tr></table></td></tr></table></body></html>` };
}

/** `token: …` stays in the plain-text part on its own so support can read it out and tests can find it. */
export function verifyEmail(to: string, token: string): Mail {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return { to, subject: "Verify your email", text: `Confirm your email address for Webbrik:\n${url}\n\nIf the link doesn't work, use this token: ${token}\n\nIf you didn't create an account, ignore this message.`, ...layout("Confirm your email", "Confirm this address to finish setting up your Webbrik account. The link works for 48 hours.", "Confirm email", url, "If you didn't create an account, you can ignore this message.") };
}
export function resetPassword(to: string, token: string): Mail {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return { to, subject: "Reset your password", text: `Choose a new Webbrik password:\n${url}\n\nIf the link doesn't work, use this token: ${token}\n\nThe link works for one hour. If you didn't ask for this, ignore this message — your password hasn't changed.`, ...layout("Reset your password", "Use the button below to choose a new password. The link works for one hour.", "Choose a new password", url, "If you didn't ask for this, ignore this message. Your password hasn't changed.") };
}
export function confirmNewEmail(to: string, token: string): Mail {
  const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}&change=1`;
  return { to, subject: "Confirm your new email address", text: `Confirm this address as your new Webbrik email:\n${url}\n\nIf the link doesn't work, use this token: ${token}\n\nThe link works for 24 hours. If you didn't ask for this, ignore this message.`, ...layout("Confirm your new email", "Confirm this address to use it for your Webbrik account. The link works for 24 hours.", "Confirm new email", url, "If you didn't ask for this, ignore this message — nothing will change.") };
}
export function emailChanged(to: string, newEmail: string): Mail {
  const text = `The email address on your Webbrik account was changed to ${newEmail}.\n\nIf this wasn't you, reset your password straight away and contact support.`;
  return { to, subject: "Your Webbrik email address was changed", text, ...layout("Your email was changed", `The email address on your account is now ${newEmail}.`, "Open Webbrik", appUrl(), "If this wasn't you, reset your password straight away.") };
}
export function invite(to: string, workspace: string, inviter: string, token: string): Mail {
  const url = `${appUrl()}/invite?token=${encodeURIComponent(token)}`;
  return { to, subject: `${inviter} invited you to ${workspace} on Webbrik`, text: `${inviter} invited you to join "${workspace}" on Webbrik:\n${url}\n\nIf the link doesn't work, use this token: ${token}`, ...layout(`Join ${workspace}`, `${inviter} invited you to collaborate in the workspace "${workspace}".`, "Accept invitation", url, "If you weren't expecting this, you can ignore this message.") };
}
export function formSubmission(to: string, project: string, formId: string, data: Record<string, unknown>, projectId: string): Mail {
  const url = `${appUrl()}/projects/${encodeURIComponent(projectId)}?tab=Forms`;
  const lines = Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`);
  const body = lines.join("\n");
  return { to, subject: `New "${formId}" submission on ${project}`, text: `Someone submitted the "${formId}" form on ${project}:\n\n${body}\n\nAll submissions: ${url}`, ...layout(`New ${formId} submission`, `${project}: ${lines.slice(0, 12).join(" · ").slice(0, 600)}`, "View submissions", url, "You get this because your address is listed as a notification recipient for this form.") };
}
export function receipt(to: string, workspace: string, plan: string, amount: string, invoiceNo?: string): Mail {
  return { to, subject: `Webbrik ${plan} plan is active`, text: `Payment received: ${amount}.${invoiceNo ? `\nInvoice ${invoiceNo} is available in your workspace billing page.` : ""}\nThe "${workspace}" workspace is now on the ${plan} plan.`, ...layout(`${plan} plan is active`, `We received ${amount}. The workspace "${workspace}" is now on the ${plan} plan.`, "Open Webbrik", appUrl() + "/dashboard", "Keep this email as your receipt.") };
}
