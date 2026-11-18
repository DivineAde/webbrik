"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

const surface = "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-52 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-1.5 text-sm shadow-[var(--shadow-lg)] data-[state=open]:animate-in data-[state=open]:fade-in-0";
const row = "relative flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[state=open]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const DropdownMenu = M.Root, DropdownMenuTrigger = M.Trigger, DropdownMenuSub = M.Sub, DropdownMenuGroup = M.Group, DropdownMenuRadioGroup = M.RadioGroup;
export const DropdownMenuSeparator = (p: React.ComponentProps<typeof M.Separator>) => <M.Separator className="my-1.5 h-px bg-border" {...p} />;

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.Content>>(function C({ className, sideOffset = 6, ...p }, ref) {
  return <M.Portal><M.Content ref={ref} sideOffset={sideOffset} collisionPadding={8} className={cn(surface, className)} {...p} /></M.Portal>;
});
export const DropdownMenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean }>(function I({ className, destructive, ...p }, ref) {
  return <M.Item ref={ref} className={cn(row, destructive && "text-destructive [&_svg]:text-destructive", className)} {...p} />;
});
export const DropdownMenuCheckboxItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.CheckboxItem>>(function I({ className, children, ...p }, ref) {
  return (
    <M.CheckboxItem ref={ref} className={cn(row, "pl-8", className)} {...p}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center"><M.ItemIndicator><Check className="!text-foreground" /></M.ItemIndicator></span>
      {children}
    </M.CheckboxItem>
  );
});
export const DropdownMenuRadioItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.RadioItem>>(function I({ className, children, ...p }, ref) {
  return (
    <M.RadioItem ref={ref} className={cn(row, "pl-8", className)} {...p}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center"><M.ItemIndicator><Check className="!text-foreground" /></M.ItemIndicator></span>
      {children}
    </M.RadioItem>
  );
});
export const DropdownMenuSubTrigger = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.SubTrigger>>(function S({ className, children, ...p }, ref) {
  return <M.SubTrigger ref={ref} className={cn(row, className)} {...p}>{children}<ChevronRight className="ml-auto" /></M.SubTrigger>;
});
export const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof M.SubContent>>(function S({ className, ...p }, ref) {
  return <M.Portal><M.SubContent ref={ref} collisionPadding={8} sideOffset={8} alignOffset={-6} className={cn(surface, className)} {...p} /></M.Portal>;
});
export const DropdownMenuLabel = (p: React.ComponentProps<typeof M.Label>) => <M.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground" {...p} />;
export const DropdownMenuShortcut = ({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) => <span className={cn("ml-auto pl-6 text-xs tracking-wide text-muted-foreground", className)} {...p} />;
