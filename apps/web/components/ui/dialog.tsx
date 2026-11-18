"use client";
import * as D from "@radix-ui/react-dialog";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root, DialogTrigger = D.Trigger, DialogClose = D.Close;
export const DialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof D.Content> & { title: string; description?: string }>(function DialogContent({ className, children, title, description, ...p }, ref) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <D.Content ref={ref} aria-describedby={description ? undefined : undefined} className={cn("fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 shadow-lg focus:outline-none", className)} {...p}>
        <D.Title className="text-sm font-semibold">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-xs text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-4">{children}</div>
        <D.Close aria-label="Close" className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">✕</D.Close>
      </D.Content>
    </D.Portal>
  );
});
