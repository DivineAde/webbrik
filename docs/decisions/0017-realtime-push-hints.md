# ADR-0017: WebSocket push hints
Status: accepted. The API runs a `ws` hub that only sends hints (`hello`, `ops`, `presence`); clients still fetch ops over HTTP, so correctness doesn't depend on the socket. Auth: Origin check, session cookie, workspace membership. Clients poll every 20 s while connected, 3 s otherwise. Hints are per API instance; other instances rely on polling.
