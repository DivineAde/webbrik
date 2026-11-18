import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("rounded-lg border border-border bg-background p-4", className)} {...p} />;
const badge = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", { variants: { tone: { neutral: "border-border bg-muted text-foreground", success: "border-transparent bg-[oklch(0.93_0.07_150)] text-[oklch(0.3_0.09_150)]", warning: "border-transparent bg-[oklch(0.94_0.08_85)] text-[oklch(0.35_0.09_70)]", danger: "border-transparent bg-[oklch(0.93_0.06_25)] text-[oklch(0.38_0.14_25)]" } }, defaultVariants: { tone: "neutral" } });
export const Badge = ({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) => <span className={cn(badge({ tone }), className)} {...p} />;
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Ta({ className, ...p }, ref) { return <textarea ref={ref} className={cn("min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring", className)} {...p} />; });
