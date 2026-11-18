import { describe, expect, it } from "vitest";
import { createDocument, createNode, type Document, type Operation } from "@webbrik/document-model";
import { CollabClient, CollabServer, Presence, type Committed } from "./index";

function ins(doc: Document, id: string, parent?: string): Operation {
  const p = parent ?? doc.pages[0]!.rootId;
  return { type: "insertSubtree", rootId: id, nodes: [createNode({ id, parentId: p })], parentId: p, index: 99 };
}

function world() {
  const base = createDocument("t");
  const server = new CollabServer(base);
  const mk = (id: string) => new CollabClient(base, 0, id);
  const deliver = (clients: CollabClient[], from: number) => {
    for (const c of server.since(from) ?? []) for (const cl of clients) cl.receive(c);
  };
  return { base, server, mk, deliver };
}

describe("collaboration", () => {
  it("converges when two clients edit concurrently", () => {
    const { base, server, mk, deliver } = world();
    const a = mk("a"), b = mk("b");
    const ta = a.local([ins(base, "x")]);
    const tb = b.local([ins(base, "y")]);
    expect(server.submit(ta).ok).toBe(true);
    expect(server.submit(tb).ok).toBe(true);
    deliver([a, b], 0);
    expect(a.current).toEqual(server.doc);
    expect(b.current).toEqual(server.doc);
    expect(server.doc.nodes[base.pages[0]!.rootId]!.children).toEqual(["x", "y"]);
    expect(a.pendingTx).toHaveLength(0);
  });

  it("merges concurrent style edits to different properties and last-writer-wins on the same one", () => {
    const { base, server, mk, deliver } = world();
    const seed = mk("seed");
    server.submit(seed.local([ins(base, "n")]));
    const a = mk("a"), b = mk("b");
    deliver([a, b], 0);
    const set = (c: CollabClient, decl: Record<string, string>) => c.local([{ type: "setStyle", id: "n", breakpoint: "base", declarations: decl }]);
    const t1 = set(a, { color: "red", margin: "1px" });
    const t2 = set(b, { color: "blue", padding: "2px" });
    server.submit(t1); server.submit(t2);
    deliver([a, b], 1);
    const decl = server.doc.nodes["n"]!.styles[0]!.declarations;
    expect(decl).toEqual({ color: "blue", margin: "1px", padding: "2px" });
    expect(a.current).toEqual(server.doc);
    expect(b.current).toEqual(server.doc);
  });

  it("rejects an edit to a node another user deleted and the client converges", () => {
    const { base, server, mk, deliver } = world();
    const seed = mk("seed");
    server.submit(seed.local([ins(base, "n")]));
    const a = mk("a"), b = mk("b");
    deliver([a, b], 0);
    const del = a.local([{ type: "deleteElement", id: "n" }]);
    const style = b.local([{ type: "setStyle", id: "n", breakpoint: "base", declarations: { color: "red" } }]);
    expect(server.submit(del).ok).toBe(true);
    const r = server.submit(style);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("conflict"); b.reject(style.id); }
    deliver([a, b], 1);
    expect(b.current).toEqual(server.doc);
    expect(b.current.nodes["n"]).toBeUndefined();
    expect(b.dropped).toHaveLength(1);
  });

  it("drops local pending ops that no longer apply after a remote change (without server involvement)", () => {
    const { base, server, mk } = world();
    const seed = mk("seed");
    server.submit(seed.local([ins(base, "n")]));
    const a = mk("a");
    for (const c of server.since(0)!) a.receive(c);
    a.local([{ type: "setStyle", id: "n", breakpoint: "base", declarations: { color: "red" } }]);
    const remote: Committed = { revision: 2, txId: "r", clientId: "z", ops: [{ type: "deleteElement", id: "n" }] };
    expect(a.receive(remote)).toBe(true);
    expect(a.current.nodes["n"]).toBeUndefined();
    expect(a.pendingTx).toHaveLength(0);
    expect(a.dropped).toHaveLength(1);
  });

  it("is idempotent for retried transactions and detects revision gaps", () => {
    const { base, server, mk } = world();
    const a = mk("a");
    const t = a.local([ins(base, "x")]);
    const r1 = server.submit(t), r2 = server.submit(t);
    expect(r1.ok && r2.ok && r1.committed.revision === r2.committed.revision).toBe(true);
    expect(server.revision).toBe(1);
    expect(a.receive({ revision: 5, txId: "q", clientId: "z", ops: [] })).toBe(false);
  });

  it("expires presence without heartbeats", () => {
    const p = new Presence(1000);
    p.update({ clientId: "a", name: "A", color: "#000", selection: [] }, 0);
    expect(p.active(500)).toHaveLength(1);
    expect(p.active(2000)).toHaveLength(0);
  });
});
