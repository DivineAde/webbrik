import type { Transport } from "@webbrik/editor-core";
import { ApiError, api } from "@/lib/api";

/** Collaboration transport over the REST API. Network failures throw (retryable); 409/400 become rejections. */
export function httpTransport(projectId: string): Transport {
  return {
    load: async () => api(`/projects/${projectId}/document`),
    submit: async (tx) => {
      try {
        const r = await api<{ committed: never }>(`/projects/${projectId}/ops`, { method: "POST", body: tx });
        return { ok: true, committed: r.committed };
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 400)) {
          const b = e.body as { code?: string; headRevision?: number } | undefined;
          return { ok: false, reason: b?.code === "revision_conflict" ? "conflict" : "invalid", message: e.message, headRevision: b?.headRevision ?? 0 };
        }
        throw e;
      }
    },
    poll: async (since) => api(`/projects/${projectId}/ops?since=${since}`),
  };
}
