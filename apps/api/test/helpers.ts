import type { INestApplication } from "@nestjs/common";
import { createApp, type AppOverrides } from "../src/app.module";
import { Db } from "../src/common/db";
import { OutboxMailer } from "../src/common/mailer";
import { RelationalStore, sqliteSql } from "../src/common/relational";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class Client {
  cookies = new Map<string, string>();
  constructor(private base: string, public csrf = true) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { "content-type": "application/json", ...headers };
    if (this.csrf) h["x-requested-with"] = "webbrik";
    if (this.cookies.size) h["cookie"] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(this.base + "/v1" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";"); const [k, ...v] = pair!.split("=");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k!); else this.cookies.set(k!, v.join("="));
    }
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json() : ct.includes("zip") || ct.length ? Buffer.from(await res.arrayBuffer()) : undefined;
    return { status: res.status, data: data as any, headers: res.headers };
  }
  get = (p: string, h?: Record<string, string>) => this.req("GET", p, undefined, h);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  put = (p: string, b?: unknown) => this.req("PUT", p, b ?? {});
  patch = (p: string, b?: unknown) => this.req("PATCH", p, b ?? {});
  del = (p: string, b?: unknown) => this.req("DELETE", p, b);
}

export interface Env { app: INestApplication; db: Db; mailer: OutboxMailer; base: string; client: () => Client; signup: (email: string, name?: string) => Promise<Client & { workspaceId: string; userId: string }>; close: () => Promise<void> }

export async function startEnv(overrides: AppOverrides = {}): Promise<Env> {
  const db = overrides.db ?? new Db();
  const mailer = (overrides.mailer as OutboxMailer) ?? new OutboxMailer();
  // TEST_STORE=sqlite runs the whole suite against the relational SQLite store (constraints, foreign keys and all).
  let tmp: string | undefined;
  let store = overrides.store;
  if (store === undefined && process.env.TEST_STORE === "sqlite") { tmp = mkdtempSync(join(tmpdir(), "wbt-")); store = new RelationalStore(sqliteSql(join(tmp, "t.db"))); }
  const app = await createApp({ ...overrides, store, db, mailer });
  await app.listen(0);
  const base = await app.getUrl();
  const url = base.replace("[::1]", "localhost");
  const client = () => new Client(url);
  const signup = async (email: string, name = email.split("@")[0]!) => {
    const c = client();
    const r = await c.post("/auth/register", { email, password: "correct-horse-battery", name });
    if (r.status !== 201) throw new Error("signup failed " + JSON.stringify(r.data));
    const me = await c.get("/auth/me");
    return Object.assign(c, { workspaceId: me.data.workspaces[0].id as string, userId: me.data.user.id as string });
  };
  return { app, db, mailer, base: url, client, signup, close: async () => { await app.close(); if (tmp) rmSync(tmp, { recursive: true, force: true }); } };
}
