"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Page, tokenFromUrl } from "@/features/account/ui";

export default function VerifyEmail() {
  const [state, setState] = useState<"working" | "ok" | "bad">("working");
  useEffect(() => { const t = tokenFromUrl(); if (!t) return setState("bad"); const change = new URLSearchParams(location.search).get("change") === "1"; api(change ? "/auth/email/confirm" : "/auth/verify-email", { method: "POST", body: { token: t } }).then(() => setState("ok")).catch(() => setState("bad")); }, []);
  return (
    <Page title="Verify your email">
      {state === "working" && <p className="text-muted-foreground">Verifying…</p>}
      {state === "ok" && <p role="status">Your email is verified. <Link className="underline" href="/dashboard">Continue</Link></p>}
      {state === "bad" && <p role="alert">This verification link is invalid or has expired. Sign in and request a new one from account settings.</p>}
    </Page>
  );
}
