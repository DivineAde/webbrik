import nodemailer, { type Transporter } from "nodemailer";

export interface Mail { to: string; subject: string; text: string; html?: string }
export interface Mailer { send(mail: Mail): Promise<void> }

/** Collects mail in memory (development and tests). */
export class OutboxMailer implements Mailer {
  outbox: Mail[] = [];
  async send(mail: Mail) { this.outbox.push(mail); if (process.env.NODE_ENV === "development") console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`); }
  last(to?: string) { return [...this.outbox].reverse().find((m) => !to || m.to === to); }
}

export interface SmtpConfig {
  host: string; port: number;
  /** true = implicit TLS (port 465); false = STARTTLS when the server offers it. */
  secure: boolean;
  user?: string; pass?: string;
  from: string;
  /** Test servers only: skip certificate verification. Never set in production. */
  insecureTls?: boolean;
  /** Test servers only: allow plain-text auth without TLS. */
  allowInsecureAuth?: boolean;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** Sends through any SMTP server (Postmark, SES, Mailgun, Zoho, Gmail app passwords, your own). */
export class SmtpMailer implements Mailer {
  private tx: Transporter;
  constructor(private cfg: SmtpConfig) {
    this.tx = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
      requireTLS: !cfg.secure && !cfg.allowInsecureAuth && !!cfg.user, // never send a password in clear text
      tls: cfg.insecureTls ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      pool: true, maxConnections: 3,
    });
  }
  async send(mail: Mail) {
    // Header values come from user input (workspace names), so line breaks are stripped to prevent header injection.
    await this.tx.sendMail({ from: this.cfg.from, to: oneLine(mail.to), subject: oneLine(mail.subject), text: mail.text, ...(mail.html ? { html: mail.html } : {}) });
  }
  /** Checks host, port, TLS and credentials without sending anything. */
  verify() { return this.tx.verify(); }
  close() { this.tx.close(); }
}

/**
 * SMTP_URL (smtp://user:pass@host:587 or smtps://…:465) or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE, plus MAIL_FROM.
 * Returns null when no SMTP server is configured.
 */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const from = env["MAIL_FROM"];
  if (env["SMTP_URL"]) {
    const u = new URL(env["SMTP_URL"]);
    if (!/^smtps?:$/.test(u.protocol)) throw new Error("SMTP_URL must start with smtp:// or smtps://");
    const secure = u.protocol === "smtps:";
    return { host: u.hostname, port: Number(u.port || (secure ? 465 : 587)), secure, user: u.username ? decodeURIComponent(u.username) : undefined, pass: u.password ? decodeURIComponent(u.password) : undefined, from: from ?? "Webbrik <no-reply@localhost>" };
  }
  if (!env["SMTP_HOST"]) return null;
  const secure = env["SMTP_SECURE"] === "1" || env["SMTP_SECURE"] === "true" || env["SMTP_PORT"] === "465";
  return { host: env["SMTP_HOST"], port: Number(env["SMTP_PORT"] ?? (secure ? 465 : 587)), secure, user: env["SMTP_USER"], pass: env["SMTP_PASS"], from: from ?? "Webbrik <no-reply@localhost>" };
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
  const cfg = smtpConfigFromEnv(env);
  return cfg ? new SmtpMailer(cfg) : undefined;
}

/** Sends mail and reports failure instead of throwing, so a mail outage never breaks sign-up or reset flows. */
export async function safeSend(mailer: Mailer, mail: Mail): Promise<boolean> {
  try { await mailer.send(mail); return true; }
  catch (e) { console.error(`[mail] failed to send "${mail.subject}": ${(e as Error).message}`); return false; }
}

export const MAILER = Symbol("MAILER");
