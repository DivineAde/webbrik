import { Injectable } from "@nestjs/common";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Db } from "./db";
import { SESSION_COOKIE, hashToken } from "./http";
import type { Persistence } from "./persistence";

/**
 * WebSocket push for the editor. It carries only *hints* ("project X has a new revision", "presence changed"):
 * clients still fetch the actual operations over the authenticated HTTP API, so there is one authority path
 * and one set of permission checks. Polling stays as a slow safety net (and is what other API instances rely
 * on: a hint only reaches sockets connected to the instance that committed the change).
 */
@Injectable()
export class Realtime {
  private wss = new WebSocketServer({ noServer: true });
  private rooms = new Map<string, Set<WebSocket>>();
  private heartbeat?: ReturnType<typeof setInterval>;
  readonly path = "/v1/realtime";

  get connections() { let n = 0; for (const s of this.rooms.values()) n += s.size; return n; }

  attach(server: Server, db: Db, persistence: Persistence | null, origins: string[]) {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", "http://x");
      if (url.pathname !== this.path) return; // not ours (another upgrade handler, or none: the socket is left to time out)
      const reject = (code: number, text: string) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
      void (async () => {
        // Browsers always send Origin on WebSocket handshakes; cookies are sent cross-site, so this is the CSRF defence.
        const origin = req.headers.origin;
        if (origin && !origins.includes(origin)) return reject(403, "Forbidden");
        const raw = (req.headers.cookie ?? "").split(";").map((p) => p.trim().split("=")).find(([k]) => k === SESSION_COOKIE)?.slice(1).join("=");
        if (!raw) return reject(401, "Unauthorized");
        const hash = hashToken(decodeURIComponent(raw));
        const find = () => db.sessions.find((x) => x.tokenHash === hash && x.expiresAt > Date.now());
        let s = find();
        if (!s && persistence?.syncable) { await persistence.syncFresh(100).catch(() => undefined); s = find(); }
        const user = s && db.users.get(s.userId);
        const projectId = url.searchParams.get("projectId") ?? "";
        const project = db.projects.get(projectId);
        if (!user || !project || project.deletedAt) return reject(user ? 404 : 401, user ? "Not Found" : "Unauthorized");
        if (!db.memberships.find((m) => m.userId === user.id && m.workspaceId === project.workspaceId)) return reject(403, "Forbidden");
        this.wss.handleUpgrade(req, socket, head, (ws) => this.join(projectId, s!.id, ws, db));
      })().catch(() => reject(500, "Error"));
    });
    this.heartbeat = setInterval(() => {
      for (const set of this.rooms.values()) for (const ws of set) {
        const w = ws as WebSocket & { alive?: boolean };
        if (w.alive === false) { ws.terminate(); continue; }
        w.alive = false; try { ws.ping(); } catch { /* closing */ }
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  private join(projectId: string, sessionId: string, ws: WebSocket, db: Db) {
    let set = this.rooms.get(projectId); if (!set) this.rooms.set(projectId, (set = new Set()));
    set.add(ws);
    const w = ws as WebSocket & { alive?: boolean }; w.alive = true;
    ws.on("pong", () => { w.alive = true; });
    // Sign-out or revocation closes the socket at the next message; re-check cheaply on every inbound frame.
    ws.on("message", () => { if (!db.sessions.get(sessionId)) ws.close(4401, "session ended"); else ws.send(JSON.stringify({ type: "pong" })); });
    ws.on("close", () => { set!.delete(ws); if (!set!.size) this.rooms.delete(projectId); });
    ws.send(JSON.stringify({ type: "hello" }));
  }

  notify(projectId: string, msg: { type: "ops"; revision: number } | { type: "presence" }) {
    const set = this.rooms.get(projectId); if (!set) return;
    const data = JSON.stringify(msg);
    for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data);
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.rooms.values()) for (const ws of set) ws.close(1001, "server shutting down");
    this.rooms.clear(); this.wss.close();
  }
}
