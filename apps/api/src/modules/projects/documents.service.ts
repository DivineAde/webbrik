import { History, validateDocument, type Document } from "@webbrik/document-model";
import { CollabServer } from "@webbrik/collaboration";
import { Db } from "../../common/db";

export class ConflictError extends Error {
  constructor(public readonly headRevision: number) {
    super(`Revision conflict: head is ${headRevision}`);
  }
}

export interface DocumentStore {
  head(projectId: string): Promise<{ revision: number; document: Document } | null>;
  append(projectId: string, revision: number, document: Document, authorId?: string): Promise<void>;
}

/** Validated, optimistic-concurrency saves. Never silently overwrites newer work. */
export class DocumentsService {
  constructor(private store: DocumentStore) {}

  async save(projectId: string, baseRevision: number, input: unknown, authorId?: string) {
    const result = validateDocument(input);
    if (!result.ok || !result.document) return { ok: false as const, issues: result.issues };
    const head = await this.store.head(projectId);
    const headRev = head?.revision ?? 0;
    if (baseRevision !== headRev) throw new ConflictError(headRev);
    await this.store.append(projectId, headRev + 1, result.document, authorId);
    return { ok: true as const, revision: headRev + 1 };
  }

  async load(projectId: string) {
    const head = await this.store.head(projectId);
    return head ? { revision: head.revision, history: new History(head.document).doc } : null;
  }
}

export class DbDocumentStore implements DocumentStore {
  constructor(private db: Db, private onWrite?: (projectId: string) => void) {}
  async head(projectId: string) {
    const p = this.db.projects.get(projectId);
    if (!p) return null;
    const r = this.db.revisions.find((x) => x.projectId === projectId && x.revision === p.headRevision);
    return r ? { revision: r.revision, document: r.document } : null;
  }
  async append(projectId: string, revision: number, document: Document, authorId?: string) {
    this.db.revisions.insert({ projectId, revision, document, authorId, createdAt: Date.now() });
    this.db.projects.update(projectId, { headRevision: revision, updatedAt: Date.now() });
    this.onWrite?.(projectId);
  }
}

/** One in-memory collaboration session per project; invalidated by any non-collab write. */
export class CollabHub {
  private servers = new Map<string, CollabServer>();
  constructor(private db: Db) {}
  server(projectId: string): CollabServer {
    let s = this.servers.get(projectId);
    const p = this.db.projects.get(projectId)!;
    if (!s || s.revision !== p.headRevision) {
      const head = this.db.revisions.find((r) => r.projectId === projectId && r.revision === p.headRevision)!;
      s = new CollabServer(head.document, p.headRevision);
      this.servers.set(projectId, s);
    }
    return s;
  }
  invalidate(projectId: string) { this.servers.delete(projectId); }
}
