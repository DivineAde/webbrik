import type { ShellWorkspace } from "@/components/AppShell";

/** What the sidebar shows, kept between pages so moving around the app doesn't blank and refill it. Revalidated on every page. */
export const shellCache: { user: { name: string; email: string } | null; ws: ShellWorkspace[]; active: string; used: Record<string, number> } = { user: null, ws: [], active: "", used: {} };
