import { applyOperations, type Operation } from "./operations";
import type { Document } from "./schema";

export interface Transaction {
  label: string;
  ops: Operation[];
  inverse: Operation[];
  at: number;
}

/**
 * Transaction-based history. A transaction groups several operations into one undo step.
 * AI proposals, inspector edits, and collaboration-applied remote ops all go through `commit`.
 */
export class History {
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private current: Document,
    private readonly limit = 500,
  ) {}

  get doc(): Document {
    return this.current;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  commit(label: string, ops: Operation[]): Transaction {
    const { doc, inverse } = applyOperations(this.current, ops); // throws => nothing changes
    const tx: Transaction = { label, ops, inverse, at: Date.now() };
    this.current = doc;
    this.undoStack.push(tx);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
    return tx;
  }

  undo(): boolean {
    const tx = this.undoStack.pop();
    if (!tx) return false;
    const { doc, inverse } = applyOperations(this.current, tx.inverse);
    this.current = doc;
    this.redoStack.push({ ...tx, ops: tx.inverse, inverse });
    this.emit();
    return true;
  }

  redo(): boolean {
    const tx = this.redoStack.pop();
    if (!tx) return false;
    const { doc, inverse } = applyOperations(this.current, tx.inverse);
    this.current = doc;
    this.undoStack.push({ ...tx, ops: tx.inverse, inverse });
    this.emit();
    return true;
  }

  /** Replace the document with a server-provided/recovered snapshot and clear history boundaries. */
  reset(doc: Document) {
    this.current = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }
}
