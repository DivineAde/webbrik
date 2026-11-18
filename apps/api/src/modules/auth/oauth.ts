export interface OAuthProfile { id: string; email: string; name: string; emailVerified: boolean }
export interface OAuthProvider { exchange(code: string, redirectUri?: string): Promise<OAuthProfile> }
export const OAUTH_PROVIDERS = Symbol("OAUTH_PROVIDERS");

/** NOTE: GitHub/Google adapters follow the public OAuth docs but have not been run against the live providers. */
export function githubProvider(clientId: string, clientSecret: string, f: typeof fetch = fetch): OAuthProvider {
  return {
    async exchange(code) {
      const t = (await (await f("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }) })).json()) as { access_token?: string };
      if (!t.access_token) throw new Error("OAuth exchange failed");
      const h = { authorization: `Bearer ${t.access_token}`, accept: "application/vnd.github+json", "user-agent": "webbrik" };
      const u = (await (await f("https://api.github.com/user", { headers: h })).json()) as { id: number; name?: string; login: string };
      const emails = (await (await f("https://api.github.com/user/emails", { headers: h })).json()) as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified);
      if (!primary) throw new Error("No verified primary email");
      return { id: String(u.id), email: primary.email, name: u.name ?? u.login, emailVerified: true };
    },
  };
}

export function googleProvider(clientId: string, clientSecret: string, f: typeof fetch = fetch): OAuthProvider {
  return {
    async exchange(code, redirectUri) {
      const t = (await (await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri ?? "", grant_type: "authorization_code" }) })).json()) as { access_token?: string };
      if (!t.access_token) throw new Error("OAuth exchange failed");
      const u = (await (await f("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } })).json()) as { sub: string; email: string; name?: string; email_verified?: boolean };
      return { id: u.sub, email: u.email, name: u.name ?? u.email, emailVerified: !!u.email_verified };
    },
  };
}
