import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { simpleParser, type ParsedMail } from "mailparser";
import type { AddressInfo } from "node:net";
import { SmtpMailer, smtpConfigFromEnv, safeSend } from "../src/common/mailer";
import * as emails from "../src/common/emails";
import { startEnv } from "./helpers";

const received: ParsedMail[] = [];
let server: SMTPServer; let port: number;
beforeAll(async () => {
  server = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ["STARTTLS"],
    onAuth(auth, _s, cb) { auth.username === "mailer" && auth.password === "s3cret!" ? cb(null, { user: "mailer" }) : cb(new Error("Invalid credentials")); },
    onData(stream, _s, cb) { simpleParser(stream).then((m) => { received.push(m); cb(); }, cb); },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.server.address() as AddressInfo).port;
});
afterAll(() => Promise.race([new Promise<void>((r) => server.close(() => r())), new Promise<void>((r) => setTimeout(r, 1000))]));

const cfg = () => ({ host: "127.0.0.1", port, secure: false, user: "mailer", pass: "s3cret!", from: "Webbrik <no-reply@webbrik.test>", allowInsecureAuth: true });

describe("SmtpMailer against a real SMTP server", () => {
  it("authenticates, verifies the connection and delivers html + text", async () => {
    const m = new SmtpMailer(cfg());
    await m.verify();
    await m.send(emails.verifyEmail("ada@example.com", "tok_123"));
    const got = received.at(-1)!;
    expect(got.from?.value[0]).toMatchObject({ name: "Webbrik", address: "no-reply@webbrik.test" });
    expect(got.to).toMatchObject({ text: "ada@example.com" });
    expect(got.subject).toBe("Verify your email");
    expect(got.text).toContain("token: tok_123");
    expect(got.html).toContain("/verify-email?token=tok_123");
    m.close();
  });
  it("rejects wrong credentials and refuses to send a password without TLS unless explicitly allowed", async () => {
    const bad = new SmtpMailer({ ...cfg(), pass: "wrong" });
    await expect(bad.send({ to: "a@b.co", subject: "x", text: "y" })).rejects.toThrow(/credentials|auth/i);
    bad.close();
    const strict = new SmtpMailer({ ...cfg(), allowInsecureAuth: false }); // server offers no STARTTLS
    await expect(strict.send({ to: "a@b.co", subject: "x", text: "y" })).rejects.toThrow();
    strict.close();
  });
  it("strips line breaks from user-controlled headers (no header injection)", async () => {
    const m = new SmtpMailer(cfg());
    await m.send({ to: "x@example.com", subject: "Hello\r\nBcc: attacker@evil.com", text: "body" });
    const got = received.at(-1)!;
    expect(got.subject).toBe("Hello Bcc: attacker@evil.com");
    expect(got.headers.get("bcc")).toBeUndefined();
    m.close();
  });
  it("escapes markup in the html part", async () => {
    const mail = emails.invite("a@b.co", '<img src=x onerror=alert(1)>', "Eve <script>", "t");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;img");
  });
  it("safeSend reports failure instead of throwing", async () => {
    const dead = new SmtpMailer({ ...cfg(), port: 1 });
    expect(await safeSend(dead, { to: "a@b.co", subject: "x", text: "y" })).toBe(false);
    dead.close();
  });
});

describe("TLS", () => {
  const tlsServer = (secure: boolean) => new Promise<{ srv: SMTPServer; port: number; got: ParsedMail[] }>((resolve) => {
    const got: ParsedMail[] = [];
    const srv = new SMTPServer({ secure, authOptional: false, onAuth(a, _s, cb) { a.username === "u" && a.password === "p" ? cb(null, { user: "u" }) : cb(new Error("bad")); }, onData(st, _s, cb) { simpleParser(st).then((m) => { got.push(m); cb(); }, cb); } });
    srv.on("error", () => undefined); // the client deliberately aborts in the untrusted-certificate test
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: (srv.server.address() as AddressInfo).port, got }));
  });
  const base = { host: "127.0.0.1", user: "u", pass: "p", from: "W <w@x.co>" };
  it("works over STARTTLS and implicit TLS (self-signed test certificate)", async () => {
    for (const secure of [false, true]) {
      const t = await tlsServer(secure);
      const m = new SmtpMailer({ ...base, port: t.port, secure, insecureTls: true });
      await m.send({ to: "a@b.co", subject: secure ? "implicit" : "starttls", text: "hi" });
      expect(t.got[0]?.subject).toBe(secure ? "implicit" : "starttls");
      m.close(); t.srv.close();
    }
  });
  it("refuses an untrusted certificate unless insecureTls is set", async () => {
    const t = await tlsServer(true);
    const m = new SmtpMailer({ ...base, port: t.port, secure: true });
    await expect(m.send({ to: "a@b.co", subject: "x", text: "y" })).rejects.toThrow(/self.signed|certificate/i);
    m.close(); t.srv.close();
  });
});

describe("configuration", () => {
  it("parses SMTP_URL and discrete variables", () => {
    expect(smtpConfigFromEnv({ SMTP_URL: "smtps://user%40x:p%3Aw@smtp.example.com", MAIL_FROM: "A <a@x.co>" })).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, user: "user@x", pass: "p:w", from: "A <a@x.co>" });
    expect(smtpConfigFromEnv({ SMTP_URL: "smtp://smtp.example.com:2525" })).toMatchObject({ port: 2525, secure: false, user: undefined });
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "465" })).toMatchObject({ secure: true });
    expect(smtpConfigFromEnv({})).toBeNull();
    expect(() => smtpConfigFromEnv({ SMTP_URL: "http://x" })).toThrow();
  });
});

describe("app flows over SMTP", () => {
  it("sign-up, reset and invite emails are delivered with working links; a mail outage never breaks them", async () => {
    process.env.APP_URL = "https://app.webbrik.test";
    const env = await startEnv({ mailer: new SmtpMailer(cfg()) });
    const before = received.length;
    const c = await env.signup("flow@example.com");
    await env.client().post("/auth/password/forgot", { email: "flow@example.com" });
    for (let i = 0; i < 50 && received.length < before + 3; i++) await new Promise((r) => setTimeout(r, 50)); // signup helper may already verify; wait for the async sends
    const subjects = received.slice(before).map((m) => m.subject);
    expect(subjects).toContain("Verify your email");
    expect(subjects).toContain("Reset your password");
    const reset = received.find((m) => m.subject === "Reset your password")!;
    expect(reset.html).toContain("https://app.webbrik.test/reset-password?token=");
    expect(received.filter((m) => m.to && !Array.isArray(m.to) && m.to.text === "flow@example.com").length).toBeGreaterThanOrEqual(2);

    const down = await startEnv({ mailer: new SmtpMailer({ ...cfg(), port: 1 }) });
    const d = await down.signup("down@example.com");        // sign-up still succeeds
    expect((await d.get("/auth/me")).status).toBe(200);
    expect((await down.client().post("/auth/password/forgot", { email: "down@example.com" })).status).toBe(202);
    const ws = (await d.post("/workspaces", { name: "Team" })).data.workspace;
    down.db.workspaces.update(ws.id, { plan: "pro" });
    down.db.users.update(down.db.users.find((u) => u.email === "down@example.com")!.id, { emailVerified: true });
    const inv = await d.post(`/workspaces/${ws.id}/invites`, { email: "friend@example.com", role: "EDITOR" });
    expect(inv.status).toBeLessThan(300);
    expect(inv.data.emailSent).toBe(false);                 // the UI tells the inviter
    await env.close(); await down.close(); void c;
    delete process.env.APP_URL;
  }, 30_000);
});
