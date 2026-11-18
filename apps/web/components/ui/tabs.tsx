"use client";
import * as T from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;
export const TabsList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof T.List>>(function L({ className, ...p }, ref) { return <T.List ref={ref} className={cn("inline-flex gap-1 rounded-md bg-muted p-1", className)} {...p} />; });
export const TabsTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof T.Trigger>>(function Tr({ className, ...p }, ref) { return <T.Trigger ref={ref} className={cn("rounded px-3 py-1 text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...p} />; });
export const TabsContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof T.Content>>(function Co({ className, ...p }, ref) { return <T.Content ref={ref} className={cn("mt-3 focus-visible:outline-2 focus-visible:outline-ring", className)} {...p} />; });
