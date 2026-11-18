"use client";
import * as A from "@radix-ui/react-alert-dialog";
import * as React from "react";
import { Button } from "./button";

interface Req { message: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void }
let push: ((r: Req) => void) | null = null;

/**
 * Accessible replacement for window.confirm(): `if (await ask("Delete this?")) …`.
 * Needs <ConfirmHost /> mounted once (the root layout does). Focus is trapped, Esc and Cancel resolve false.
 */
export function ask(message: string, o: { confirmLabel?: string; destructive?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(typeof window !== "undefined" ? window.confirm(message) : false); // host not mounted (never in the app)
    push({ message, confirmLabel: o.confirmLabel ?? "Confirm", destructive: o.destructive ?? false, resolve });
  });
}

export function ConfirmHost() {
  const [queue, setQueue] = React.useState<Req[]>([]);
  React.useEffect(() => { push = (r) => setQueue((q) => [...q, r]); return () => { push = null; }; }, []);
  const cur = queue[0];
  const done = (ok: boolean) => { cur?.resolve(ok); setQueue((q) => q.slice(1)); };
  return (
    <A.Root open={!!cur} onOpenChange={(o) => { if (!o) done(false); }}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <A.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-lg focus:outline-none">
          <A.Title className="text-sm font-semibold">Are you sure?</A.Title>
          <A.Description className="mt-2 text-sm text-muted-foreground">{cur?.message}</A.Description>
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild><Button variant="secondary">Cancel</Button></A.Cancel>
            <A.Action asChild><Button variant={cur?.destructive ? "destructive" : "primary"} onClick={() => done(true)}>{cur?.confirmLabel ?? "Confirm"}</Button></A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
