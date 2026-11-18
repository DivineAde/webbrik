import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return (
    <input
      ref={ref}
      className={cn("h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors hover:border-ring/70 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30", className)}
      {...p}
    />
  );
});
