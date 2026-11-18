"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Msg, Page, tokenFromUrl } from "@/features/account/ui";

export default function Invite() {
  const [token, setToken] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => setToken(tokenFromUrl()), []);
  async function accept(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api<{ workspaceId: string }>("/invites/accept", { method: "POST", body: { token: token.trim() } }); location.assign(`/workspaces/${r.workspaceId}`); }
    catch (e) { const x = e as { status?: number; message: string }; if (x.status === 401) location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); else setErr(x.message); setBusy(false); }
  }
  return (
    <Page title="Join a workspace">
      <form onSubmit={accept} className="max-w-sm space-y-2">
        <label className="block text-xs">Invitation code<Input required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></label>
        <p className="text-xs text-muted-foreground">You must be signed in with the email address the invitation was sent to, and that address must be verified.</p>
        <Button type="submit" disabled={busy || token.trim().length < 10}>Accept invitation</Button><Msg error={err} />
      </form>
    </Page>
  );
}
