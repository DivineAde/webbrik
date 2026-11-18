"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** For sign-in, sign-up and password pages: someone who is already signed in goes straight to their dashboard. */
export function useSignedInRedirect(to = "/dashboard") {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let live = true;
    api("/auth/me").then(() => { if (live) router.replace(to); }).catch(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [router, to]);
  return checking;
}
