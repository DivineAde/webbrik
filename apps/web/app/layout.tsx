import type { Metadata } from "next";
import type { ReactNode } from "react";
import { themeCss } from "@webbrik/design-system";
import "@fontsource-variable/inter/opsz.css";
import "./globals.css";
import { ConfirmHost } from "@/components/ui/confirm";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = { title: { default: "Webbrik — Visual Website Builder", template: "%s · Webbrik" }, description: "Design, build and publish websites visually with Webbrik." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body><TooltipProvider>{children}</TooltipProvider><ConfirmHost /></body>
    </html>
  );
}
