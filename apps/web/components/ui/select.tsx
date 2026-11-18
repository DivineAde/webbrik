"use client";
import * as S from "@radix-ui/react-select";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Select = S.Root;
export const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof S.Trigger>>(function T({ className, children, ...p }, ref) {
  return <S.Trigger ref={ref} className={cn("flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring data-[placeholder]:text-muted-foreground", className)} {...p}><S.Value />{children}<S.Icon aria-hidden>▾</S.Icon></S.Trigger>;
});
export const SelectContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof S.Content>>(function C({ className, children, ...p }, ref) {
  return <S.Portal><S.Content ref={ref} position="popper" sideOffset={4} className={cn("z-50 min-w-[var(--radix-select-trigger-width)] rounded-md border border-border bg-background p-1 shadow-md", className)} {...p}><S.Viewport>{children}</S.Viewport></S.Content></S.Portal>;
});
export const SelectItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof S.Item>>(function I({ className, children, ...p }, ref) {
  return <S.Item ref={ref} className={cn("flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-40", className)} {...p}><S.ItemText>{children}</S.ItemText></S.Item>;
});
