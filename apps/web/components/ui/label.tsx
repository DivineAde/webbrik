"use client";
import * as L from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "@/lib/cn";
export const Label = React.forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof L.Root>>(function Lb({ className, ...p }, ref) { return <L.Root ref={ref} className={cn("text-xs font-medium", className)} {...p} />; });
