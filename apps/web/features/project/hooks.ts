"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Load-on-mount query with reload and error state. */
export function useQuery<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await api<T>(path)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

/** Run a mutation, surface its error, then reload. */
export function useAction(after?: () => void | Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await after?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [after]);
  return { run, error, busy };
}
