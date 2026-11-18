"use client";
import * as P from "@radix-ui/react-popover";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Popover = P.Root, PopoverTrigger = P.Trigger, PopoverClose = P.Close;
export const PopoverContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof P.Content>>(function C({ className, sideOffset = 6, ...p }, ref) {
  return <P.Portal><P.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 w-72 rounded-md border border-border bg-background p-3 text-sm shadow-md focus:outline-none", className)} {...p} /></P.Portal>;
});
