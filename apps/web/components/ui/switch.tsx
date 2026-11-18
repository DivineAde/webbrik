"use client";
import * as S from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Switch = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof S.Root>>(function Sw({ className, ...p }, ref) {
  return <S.Root ref={ref} className={cn("inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 data-[state=checked]:bg-primary", className)} {...p}><S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[18px]" /></S.Root>;
});
