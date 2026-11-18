import { describe, expect, it, vi } from "vitest";
import { analyticsHead, deliverWebhook, isPublicHttpsUrl, isStripePaymentLink, signWebhook, validateSubmission, verifyWebhook, IntegrationRegistry } from "./index";

describe("integrations", () => {
  it("builds analytics snippets only from valid ids", () => {
    expect(analyticsHead({ provider: "ga4", measurementId: "G-ABC1234" })).toContain("G-ABC1234");
    expect(() => analyticsHead({ provider: "ga4", measurementId: 'G-1");alert(1);//' })).toThrow();
    expect(() => analyticsHead({ provider: "plausible", domain: 'x.com" onload="y' })).toThrow();
    expect(analyticsHead({ provider: "plausible", domain: "example.com" })).toContain('data-domain="example.com"');
  });

  it("signs and verifies webhooks with replay protection", () => {
    const { signature } = signWebhook("s3cret", '{"a":1}', 1000);
    expect(verifyWebhook("s3cret", '{"a":1}', signature, 300, 1100)).toBe(true);
    expect(verifyWebhook("wrong", '{"a":1}', signature, 300, 1100)).toBe(false);
    expect(verifyWebhook("s3cret", '{"a":2}', signature, 300, 1100)).toBe(false);
    expect(verifyWebhook("s3cret", '{"a":1}', signature, 300, 5000)).toBe(false);
    expect(verifyWebhook("s3cret", "x", "garbage")).toBe(false);
  });

  it("blocks private webhook targets and delivers signed payloads", async () => {
    for (const u of ["http://example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3/x", "https://192.168.0.1", "https://169.254.169.254/latest", "https://172.20.0.1"]) expect(isPublicHttpsUrl(u)).toBe(false);
    expect(isPublicHttpsUrl("https://hooks.example.com/x")).toBe(true);
    const f = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    expect(await deliverWebhook({ url: "https://hooks.example.com/x", secret: "k" }, "deployment.ready", { id: 1 }, f as unknown as typeof fetch)).toBe(true);
    const [, init] = f.mock.calls[0]!;
    expect(verifyWebhook("k", init.body as string, (init.headers as Record<string, string>)["x-webbrik-signature"]!)).toBe(true);
    await expect(deliverWebhook({ url: "https://10.0.0.1/x", secret: "k" }, "e", {}, f as unknown as typeof fetch)).rejects.toThrow();
  });

  it("validates form submissions and flags honeypot spam", () => {
    const fields = [{ name: "email", type: "email" as const, required: true }, { name: "msg", type: "textarea" as const }];
    expect(validateSubmission(fields, { email: "a@b.co", msg: "hi" })).toEqual({ ok: true, data: { email: "a@b.co", msg: "hi" } });
    expect(validateSubmission(fields, { email: "nope" })).toMatchObject({ ok: false });
    expect(validateSubmission(fields, { email: "a@b.co", extra: 1 })).toMatchObject({ ok: false });
    expect(validateSubmission(fields, { email: "a@b.co", _hp: "bot" })).toMatchObject({ ok: false, spam: true });
  });

  it("recognises payment links and registers providers", () => {
    expect(isStripePaymentLink("https://buy.stripe.com/abc")).toBe(true);
    expect(isStripePaymentLink("https://buy.stripe.com.evil.test/abc")).toBe(false);
    const r = new IntegrationRegistry();
    r.register({ id: "ga4", category: "analytics", label: "GA4" });
    expect(() => r.register({ id: "ga4", category: "analytics", label: "x" })).toThrow();
    expect(r.byCategory("analytics")).toHaveLength(1);
  });
});
