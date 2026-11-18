import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startEnv, type Env } from "./helpers";

let env: Env;
beforeAll(async () => { env = await startEnv(); });
afterAll(() => env.close());
const tokenFor = (to: string) => /token: (\S+)/.exec(env.mailer.last(to)!.text)![1]!;

describe("email change", () => {
  it("needs the password, rejects taken/identical addresses, and only changes once the NEW address confirms", async () => {
    const ada = await env.signup("ada@old.com"); await env.signup("taken@x.com");
    expect((await ada.post("/auth/email/change", { email: "ada@new.com", password: "wrong-password-1" })).status).toBe(401);
    expect((await ada.post("/auth/email/change", { email: "ada@old.com", password: "correct-horse-battery" })).status).toBe(400);
    expect((await ada.post("/auth/email/change", { email: "taken@x.com", password: "correct-horse-battery" })).status).toBe(409);
    expect((await ada.post("/auth/email/change", { email: "ada@new.com", password: "correct-horse-battery" })).status).toBe(202);
    expect((await ada.get("/auth/me")).data.user.email).toBe("ada@old.com"); // unchanged until confirmed
    const t = tokenFor("ada@new.com");
    expect((await env.client().post("/auth/email/confirm", { token: "nope-nope-nope" })).status).toBe(400);
    expect((await env.client().post("/auth/email/confirm", { token: t })).status).toBe(200);
    expect((await env.client().post("/auth/email/confirm", { token: t })).status).toBe(400); // single use
    expect((await ada.get("/auth/me")).data.user.email).toBe("ada@new.com");
    expect(env.mailer.last("ada@old.com")!.subject).toMatch(/changed/i); // the old address is told
    expect((await env.client().post("/auth/login", { email: "ada@new.com", password: "correct-horse-battery" })).status).toBe(200);
    expect((await env.client().post("/auth/login", { email: "ada@old.com", password: "correct-horse-battery" })).status).toBe(401);
  });
  it("refuses at confirmation if someone else took the address in the meantime", async () => {
    const bob = await env.signup("bob@old.com");
    await bob.post("/auth/email/change", { email: "race@x.com", password: "correct-horse-battery" });
    const t = tokenFor("race@x.com");
    await env.signup("race@x.com");
    expect((await env.client().post("/auth/email/confirm", { token: t })).status).toBe(409);
  });
});
