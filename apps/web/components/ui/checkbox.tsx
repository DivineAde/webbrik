"use client";
import * as C from "@radix-ui/react-checkbox";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Checkbox = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof C.Root>>(function Cb({ className, ...p }, ref) {
  return <C.Root ref={ref} className={cn("flex size-4 shrink-0 items-center justify-center rounded border border-border bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className)} {...p}><C.Indicator className="text-xs leading-none">✓</C.Indicator></C.Root>;
});
