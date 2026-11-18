import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startEnv, type Env } from "./helpers";

process.env.DISABLE_RATE_LIMIT = "1";
let env: Env;
beforeAll(async () => { env = await startEnv(); });
afterAll(() => env.close());

async function setup(email: string) {
  const o = await env.signup(email);
  const pid = (await o.post(`/workspaces/${o.workspaceId}/projects`, { name: "Forms Site" })).data.project.id as string;
  return { o, pid };
}
const fields = [{ name: "email", type: "email", required: true }, { name: "msg", type: "textarea" }];

describe("form builder API", () => {
  it("saves fields and settings, lists forms with counts, validates ids/fields/redirects", async () => {
    const { o, pid } = await setup("fb1@x.com");
    const r = await o.put(`/projects/${pid}/forms/contact`, { fields, successMessage: "Thanks!", redirectUrl: "/thanks", notifyEmails: ["Owner@X.com", "owner@x.com"] });
    expect(r.status).toBe(200);
    expect(r.data.form.settings).toEqual({ successMessage: "Thanks!", redirectUrl: "/thanks", notifyEmails: ["owner@x.com"] });
    const list = (await o.get(`/projects/${pid}/forms`)).data.forms;
    expect(list).toEqual([expect.objectContaining({ id: "contact", submissionCount: 0, fields })]);
    expect((await o.put(`/projects/${pid}/forms/Bad_Id`, { fields })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/forms/x`, { fields: [{ name: "a", type: "text" }, { name: "a", type: "text" }] })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/forms/x`, { fields: [{ name: "_hp", type: "text" }] })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/forms/x`, { fields, redirectUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/forms/x`, { fields, redirectUrl: "//evil.example" })).status).toBe(400);
    expect((await o.put(`/projects/${pid}/forms/x`, { fields, notifyEmails: ["not-an-email"] })).status).toBe(400);
  });

  it("emails recipients on each submission (capped), fires form.submitted webhooks, and anonymous visitors from other sites can post", async () => {
    const { o, pid } = await setup("fb2@x.com");
    await o.put(`/projects/${pid}/forms/contact`, { fields, notifyEmails: ["inbox@x.com"] });
    const anon = env.client(); anon.csrf = false; // a visitor's browser doesn't send our CSRF header
    const pre = await fetch(`${env.base}/v1/public/forms/${pid}/contact`, { method: "OPTIONS", headers: { origin: "https://customer.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    const res = await anon.post(`/public/forms/${pid}/contact`, { email: "a@b.co", msg: "Hello <b>there</b>" });
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    await new Promise((r) => setTimeout(r, 50));
    const mail = env.mailer.last("inbox@x.com")!;
    expect(mail.subject).toContain("contact");
    expect(mail.text).toContain("email: a@b.co");
    expect(mail.html).not.toContain("<b>there</b>"); // submitted text is escaped
    for (let i = 0; i < 30; i++) await anon.post(`/public/forms/${pid}/contact`, { email: `n${i}@b.co` });
    await new Promise((r) => setTimeout(r, 100));
    expect(env.mailer.outbox.filter((m) => m.to === "inbox@x.com").length).toBe(20); // hourly cap
  });

  it("exports submissions as CSV that spreadsheets can't run as formulas; deletes single submissions and whole forms", async () => {
    const { o, pid } = await setup("fb3@x.com");
    await o.put(`/projects/${pid}/forms/contact`, { fields });
    const anon = env.client(); anon.csrf = false;
    await anon.post(`/public/forms/${pid}/contact`, { email: "a@b.co", msg: '=HYPERLINK("http://evil","x")' });
    await anon.post(`/public/forms/${pid}/contact`, { email: "c@d.co", msg: 'say "hi", ok' });
    const csv = ((await o.get(`/projects/${pid}/forms/contact/submissions.csv`)).data as Buffer).toString();
    expect(csv).toContain('"submitted_at","email","msg"');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain('"say ""hi"", ok"');
    const subs = (await o.get(`/projects/${pid}/forms/contact/submissions`)).data.submissions;
    expect((await o.del(`/projects/${pid}/forms/contact/submissions/${subs[0].id}`)).status).toBe(204);
    expect((await o.get(`/projects/${pid}/forms/contact/submissions`)).data.submissions).toHaveLength(1);
    expect((await o.del(`/projects/${pid}/forms/contact`)).status).toBe(204);
    expect((await o.get(`/projects/${pid}/forms`)).data.forms).toEqual([]);
    expect((await anon.post(`/public/forms/${pid}/contact`, { email: "a@b.co" })).status).toBe(404);
    expect(env.db.submissions.filter((s) => s.projectId === pid)).toHaveLength(0);
    const other = await env.signup("fb3-other@x.com");
    expect((await other.get(`/projects/${pid}/forms`)).status).toBe(404);
  });
});

describe("public content and exports that use it", () => {
  it("serves published items only, with ETag/304 and CORS", async () => {
    const { o, pid } = await setup("pc1@x.com");
    const col = (await o.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
    await o.post(`/projects/${pid}/collections/${col.id}/items`, { slug: "live", data: { title: "Live" }, status: "published" });
    await o.post(`/projects/${pid}/collections/${col.id}/items`, { slug: "wip", data: { title: "Draft" }, status: "draft" });
    const anon = env.client(); anon.csrf = false;
    const r = await anon.get(`/public/content/${pid}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.data.content[col.id].map((i: any) => i.slug)).toEqual(["live"]);
    const again = await anon.get(`/public/content/${pid}`, { "if-none-match": r.headers.get("etag")! });
    expect(again.status).toBe(304);
    expect((await anon.get(`/public/content/prj_nope`)).status).toBe(404);
  });

  it("zip/json export wires forms to this API; live=1 makes React exports fetch content at run time", async () => {
    const { o, pid } = await setup("pc2@x.com");
    const col = (await o.post(`/projects/${pid}/collections`, { slug: "posts", name: "Posts", fields: [{ name: "title", type: "text", required: true }] })).data.collection;
    await o.post(`/projects/${pid}/collections/${col.id}/items`, { slug: "a", data: { title: "A" }, status: "published" });
    const doc = (await o.get(`/projects/${pid}/document`)).data;
    const root = doc.document.pages[0].rootId as string;
    const node = (id: string, tag: string, extra: object) => ({ id, tag, parentId: root, type: "element", children: [], classIds: [], styles: [], attributes: {}, props: {}, interactions: [], ...extra });
    const ops = await o.post(`/projects/${pid}/ops`, { id: "f1", clientId: "t", baseRevision: doc.revision, ops: [{ type: "insertSubtree", rootId: "frm", parentId: root, index: 0, nodes: [node("frm", "form", { props: { formId: "contact" } })] }, { type: "insertSubtree", rootId: "ul1", parentId: root, index: 1, nodes: [node("ul1", "ul", { props: { repeat: col.id } })] }] });
    expect(ops.status).toBe(201);
    const stat = (await o.get(`/projects/${pid}/export?target=static&format=json`)).data;
    expect(stat.files["assets/interactions.js"]).toContain(env.base);
    expect(stat.files["assets/interactions.js"]).toContain(pid);
    const live = (await o.get(`/projects/${pid}/export?target=vite&format=json&live=1`)).data;
    expect(live.files["src/content/cms.ts"]).toContain(`/v1/public/content/${pid}`);
    expect(live.warnings.map((w: any) => w.code)).toContain("cms-live");
    const snap = (await o.get(`/projects/${pid}/export?target=vite&format=json`)).data;
    expect(snap.files["src/content/cms.ts"]).not.toContain("refreshContent");
  });
});
