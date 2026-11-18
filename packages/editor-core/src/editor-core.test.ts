import { describe, expect, it } from "vitest";
import { CollabServer } from "@webbrik/collaboration";
import { createDocument, createNode, validateDocument, type Document, type Operation } from "@webbrik/document-model";
import { LocalDoc, RemoteDoc, type KV, type Scheduler, type Transport } from "./index";

class MemKV implements KV { m = new Map<string, string>(); get(k: string) { return this.m.get(k) ?? null; } set(k: string, v: string) { this.m.set(k, v); } remove(k: string) { this.m.delete(k); } }

/** Manual clock so retry/backoff is deterministic. */
class FakeClock implements Scheduler {
  jobs: { id: number; at: number; fn: () => void }[] = []; now = 0; n = 0;
  setTimeout(fn: () => void, ms: number) { const id = ++this.n; this.jobs.push({ id, at: this.now + ms, fn }); return id; }
  clearTimeout(h: unknown) { this.jobs = this.jobs.filter((j) => j.id !== h); }
  async advance(ms: number) { this.now += ms; const due = this.jobs.filter((j) => j.at <= this.now); this.jobs = this.jobs.filter((j) => j.at > this.now); for (const j of due) j.fn(); await tick(); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function serverTransport(server: CollabServer, flags: { down: boolean } = { down: false }): Transport {
  const guard = () => { if (flags.down) throw new Error("network"); };
  return {
    load: async () => { guard(); return { revision: server.revision, document: server.doc }; },
    submit: async (tx) => { guard(); return server.submit(tx); },
    poll: async (since) => { guard(); const c = server.since(since); return c === null ? { resync: true as const, revision: server.revision, document: server.doc } : { resync: false as const, committed: c }; },
  };
}

const ins = (doc: Document, id: string, parent?: string): Operation => { const p = parent ?? doc.pages[0]!.rootId; return { type: "insertSubtree", rootId: id, nodes: [createNode({ id, parentId: p })], parentId: p, index: 99 }; };

describe("LocalDoc", () => {
  it("commits, undoes, redoes and persists with debounce and recovery", async () => {
    const kv = new MemKV();
    const base = createDocument("t");
    const d = new LocalDoc(base, kv, "k", 5);
    d.commit("add", [ins(base, "a")]);
    expect(d.status).toBe("saving");
    await new Promise((r) => setTimeout(r, 20));
    expect(d.status).toBe("saved");
    expect(LocalDoc.recover(kv, "k")!.nodes["a"]).toBeDefined();
    d.undo();
    expect(d.doc.nodes["a"]).toBeUndefined();
    d.redo();
    expect(d.canRedo).toBe(false);
    kv.set("k", "garbage");
    expect(LocalDoc.recover(kv, "k")).toBeNull();
    d.dispose();
  });
});

describe("RemoteDoc", () => {
  it("syncs two editors, converging on the same document, with undo as new operations", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const a = await RemoteDoc.open({ transport: serverTransport(server), clientId: "A" });
    const b = await RemoteDoc.open({ transport: serverTransport(server), clientId: "B" });
    a.commit("add x", [ins(base, "x")]);
    b.commit("add y", [ins(base, "y")]);
    await tick(); await tick();
    await a.poll(); await b.poll();
    expect(a.doc).toEqual(server.doc);
    expect(b.doc).toEqual(server.doc);
    expect(a.status).toBe("saved");
    expect(validateDocument(server.doc).ok).toBe(true);

    a.undo(); // removes x, but leaves B's y
    await tick(); await b.poll();
    expect(server.doc.nodes["x"]).toBeUndefined();
    expect(server.doc.nodes["y"]).toBeDefined();
    expect(b.doc).toEqual(server.doc);
    a.redo(); await tick(); await b.poll();
    expect(b.doc.nodes["x"]).toBeDefined();
  });

  it("drops an undo whose target was deleted by someone else instead of corrupting state", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const a = await RemoteDoc.open({ transport: serverTransport(server), clientId: "A" });
    const b = await RemoteDoc.open({ transport: serverTransport(server), clientId: "B" });
    a.commit("add", [ins(base, "x")]);
    a.commit("style", [{ type: "setStyle", id: "x", breakpoint: "base", declarations: { color: "red" } }]);
    await tick(); await tick(); await b.poll();
    b.commit("delete", [{ type: "deleteElement", id: "x" }]);
    await tick(); await tick(); await a.poll();
    expect(a.doc.nodes["x"]).toBeUndefined();
    expect(a.undo()).toBe(false); // can't undo the style on a deleted node
    expect(a.statusMessage).toMatch(/can no longer be undone/);
    expect(validateDocument(a.doc).ok).toBe(true);
  });

  it("keeps working offline, retries with exponential backoff, and flushes on reconnect", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const flags = { down: false };
    const clock = new FakeClock();
    const a = await RemoteDoc.open({ transport: serverTransport(server, flags), clientId: "A", scheduler: clock });
    flags.down = true;
    a.commit("one", [ins(base, "x")]);
    await tick();
    expect(a.status).toBe("offline");
    expect(a.doc.nodes["x"]).toBeDefined(); // still editable
    a.commit("two", [ins(base, "y")]);
    await clock.advance(1000); // first retry fails -> 2s backoff
    expect(a.status).toBe("offline");
    await clock.advance(1999); expect(server.doc.nodes["x"]).toBeUndefined();
    flags.down = false;
    await clock.advance(1); await tick(); await tick();
    expect(a.status).toBe("saved");
    expect(server.doc.nodes["x"]).toBeDefined();
    expect(server.doc.nodes["y"]).toBeDefined();
    expect(a.pendingCount).toBe(0);
  });

  it("recovers unsent edits after a crash without applying already-delivered ones twice", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const kv = new MemKV();
    const flags = { down: false };
    const a1 = await RemoteDoc.open({ transport: serverTransport(server, flags), storage: kv, storageKey: "p", clientId: "A", scheduler: new FakeClock() });
    a1.commit("delivered", [ins(base, "d")]);
    await tick(); await tick();
    expect(server.doc.nodes["d"]).toBeDefined();
    flags.down = true;
    a1.commit("unsent", [ins(base, "u")]);
    await tick();
    expect(kv.get("p")).toContain('"u"');
    // Simulate: the tx actually reached the server but the ack was lost, then the tab crashed.
    const pendingTx = JSON.parse(kv.get("p")!).pending[0];
    server.submit(pendingTx);
    a1.dispose();
    flags.down = false;
    const a2 = await RemoteDoc.open({ transport: serverTransport(server, flags), storage: kv, storageKey: "p", scheduler: new FakeClock() });
    await tick(); await tick();
    expect(a2.clientId).toBe("A"); // identity restored so the server can de-duplicate
    expect(a2.status).toBe("saved");
    expect(Object.keys(server.doc.nodes).filter((k) => k === "u")).toHaveLength(1);
    expect(a2.doc).toEqual(server.doc);
    expect(kv.get("p")).toBeNull();
  });

  it("reports conflicts, drops the rejected edit, and lets the user acknowledge", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const a = await RemoteDoc.open({ transport: serverTransport(server), clientId: "A" });
    const b = await RemoteDoc.open({ transport: serverTransport(server), clientId: "B" });
    a.commit("add", [ins(base, "x")]); await tick(); await tick(); await b.poll();
    b.commit("delete", [{ type: "deleteElement", id: "x" }]); await tick(); await tick();
    // A still thinks x exists (hasn't polled) and styles it
    a.commit("style", [{ type: "setStyle", id: "x", breakpoint: "base", declarations: { color: "red" } }]);
    await tick(); await tick(); await tick();
    expect(a.status).toBe("conflict");
    expect(a.dropped).toHaveLength(1);
    expect(a.doc).toEqual(server.doc);
    a.acknowledgeConflict();
    expect(a.status).toBe("saved");
  });

  it("resyncs from a snapshot when the server can no longer serve the gap", async () => {
    const base = createDocument("t");
    const server = new CollabServer(base);
    const a = await RemoteDoc.open({ transport: serverTransport(server), clientId: "A" });
    const forced: Transport = { ...serverTransport(server), poll: async () => ({ resync: true, revision: server.revision, document: server.doc }) };
    const b = await RemoteDoc.open({ transport: forced, clientId: "B" });
    a.commit("add", [ins(base, "x")]); await tick(); await tick();
    await b.poll();
    expect(b.doc.nodes["x"]).toBeDefined();
    expect(b.canUndo).toBe(false);
  });
});
