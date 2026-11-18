/**
 * Push channel for the editor: the API sends a tiny "something changed" hint over a WebSocket and we fetch the real
 * operations over HTTP. While connected we poll slowly (safety net); while not, we poll quickly. If sockets can't be
 * opened at all (proxy, blocked), the editor just keeps polling: nothing depends on this channel.
 */
export interface Channel { close(): void; readonly connected: boolean }

export function connectRealtime(projectId: string, handlers: { onHint(): void; onState(connected: boolean): void }, url = defaultUrl()): Channel {
  let ws: WebSocket | null = null, closed = false, attempt = 0, timer: ReturnType<typeof setTimeout> | undefined, connected = false;
  const state = (c: boolean) => { if (c !== connected) { connected = c; handlers.onState(c); } };
  const open = () => {
    if (closed) return;
    try { ws = new WebSocket(`${url}?projectId=${encodeURIComponent(projectId)}`); } catch { return retry(); }
    ws.onmessage = (e) => {
      let m: { type?: string } = {};
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === "hello") { attempt = 0; state(true); handlers.onHint(); } // catch up on anything missed while disconnected
      else if (m.type === "ops") handlers.onHint();
    };
    ws.onclose = () => { state(false); retry(); };
    ws.onerror = () => { try { ws?.close(); } catch { /* already closed */ } };
  };
  const retry = () => { if (closed) return; const wait = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500; timer = setTimeout(open, wait); };
  open();
  return { get connected() { return connected; }, close() { closed = true; clearTimeout(timer); state(false); try { ws?.close(); } catch { /* ignore */ } } };
}

function defaultUrl() {
  const explicit = process.env["NEXT_PUBLIC_REALTIME_URL"];
  if (explicit) return explicit;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/realtime`;
}
