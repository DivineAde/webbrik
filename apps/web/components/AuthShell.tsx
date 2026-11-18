import type { ReactNode } from "react";
import { BrickPattern } from "@/components/BrickPattern";
import { Brand } from "@/components/Brand";

/** Two-column layout for sign-in, sign-up and password pages: the form on the left, the brick wall on the right. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(480px,1fr)_1.1fr]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Brand href="/" className="text-[15px]" />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
      <aside className="relative hidden overflow-hidden border-l border-border lg:block" aria-hidden="true">
        <BrickPattern seed="webbrik-auth" bold neutral className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-12 pb-12 pt-32">
          <p className="max-w-md text-2xl font-semibold leading-snug">Build the site the way you see it.</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Layout, content and publishing live in one editor, so nothing gets lost between design and launch.</p>
        </div>
      </aside>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{children}</p>;
}
