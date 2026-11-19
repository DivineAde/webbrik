import type { ShellWorkspace } from "@/components/AppShell";

/** What the sidebar shows, kept between pages so moving around the app doesn't blank and refill it. Revalidated on every page. */
export const shellCache: { user: { name: string; email: string } | null; ws: ShellWorkspace[]; active: string; used: Record<string, number> } = { user: null, ws: [], active: "", used: {} };

/** Forget everything about the signed-in person. Called on sign out and on the sign-in page, so the next account never inherits the last one's workspace. */
export function resetShellCache() {
  shellCache.user = null; shellCache.ws = []; shellCache.active = ""; shellCache.used = {};
  try { localStorage.removeItem("webbrik.workspace"); } catch { /* storage unavailable */ }
}
