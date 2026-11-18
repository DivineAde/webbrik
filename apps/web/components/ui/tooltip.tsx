"use client";
import * as T from "@radix-ui/react-tooltip";
import * as React from "react";

export const TooltipProvider = T.Provider;
/** Short hint on hover and keyboard focus. Never put essential information only in a tooltip. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal><T.Content side={side} sideOffset={6} className="z-50 rounded bg-foreground px-2 py-1 text-xs text-background shadow">{label}<T.Arrow className="fill-foreground" /></T.Content></T.Portal>
    </T.Root>
  );
}
