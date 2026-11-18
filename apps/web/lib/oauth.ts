/** Browser side of "Sign in with GitHub / Google". Buttons only appear when the public client ID is configured. */
export type OAuthName = "github" | "google";
export const OAUTH: { name: OAuthName; label: string; clientId: string | undefined; authorize: string; scope: string }[] = [
  { name: "github", label: "GitHub", clientId: process.env["NEXT_PUBLIC_GITHUB_CLIENT_ID"], authorize: "https://github.com/login/oauth/authorize", scope: "read:user user:email" },
  { name: "google", label: "Google", clientId: process.env["NEXT_PUBLIC_GOOGLE_CLIENT_ID"], authorize: "https://accounts.google.com/o/oauth2/v2/auth", scope: "openid email profile" },
];
export const enabledProviders = () => OAUTH.filter((p) => !!p.clientId);
export const redirectUriFor = (name: OAuthName) => `${location.origin}/oauth/${name}`;

/** Sends the browser to the provider. `state` is a random value we check on return (CSRF protection). */
export function startOAuth(name: OAuthName, next?: string | null) {
  const p = OAUTH.find((x) => x.name === name);
  if (!p?.clientId) return;
  const state = crypto.randomUUID();
  try { sessionStorage.setItem(`wb.oauth.${name}`, JSON.stringify({ state, next: next ?? null })); } catch { /* storage blocked: the callback will refuse */ }
  const q = new URLSearchParams({ client_id: p.clientId, redirect_uri: redirectUriFor(name), scope: p.scope, state });
  if (name === "google") { q.set("response_type", "code"); q.set("prompt", "select_account"); }
  location.assign(`${p.authorize}?${q}`);
}

export function takeOAuthState(name: OAuthName, returned: string | null): { ok: boolean; next: string | null } {
  try {
    const raw = sessionStorage.getItem(`wb.oauth.${name}`); sessionStorage.removeItem(`wb.oauth.${name}`);
    const s = raw ? (JSON.parse(raw) as { state: string; next: string | null }) : null;
    return { ok: !!s && !!returned && s.state === returned, next: s?.next ?? null };
  } catch { return { ok: false, next: null }; }
}
