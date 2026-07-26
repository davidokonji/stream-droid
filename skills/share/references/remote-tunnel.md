# Remote sharing (tunnel)

Expose the session over a public URL with a scannable QR in the terminal, via
[localtunnel](https://github.com/localtunnel/localtunnel).

```bash
bun run src/server.ts --tunnel            # -t : view-only public link
bun run src/server.ts --tunnel-control    # -tc: link can also control
```

On start it prints the public link and a QR:

```
[stream-droid] public link (view-only): https://tame-lamps-vanish.loca.lt
[stream-droid] scan to open the session on another device:
  █▀▀▀▀▀█ … (QR) …
```

## View-only by default

`--tunnel` shares a **view-only** link — remote viewers watch but can't drive.
Control is gated by a random token:

- The **local** auto-opened browser gets the token (`?k=<token>`), so *you* keep
  control. The startup log prints the local control link.
- A shared **view** link (no token) → the client shows a **👁 view-only** badge;
  its control messages are dropped and `POST /api/start` returns **403**.
- **`--tunnel-control`** bakes the token into the shared link, so whoever scans
  it can control too.

So a forwarded screenshot of the view link can't drive the device; only a link
that carries the token can.

## How the gate works

- `config.SECURE` is on whenever tunneling. A request/connection is authorized if
  `?k=` equals the server's random `CONTROL_TOKEN` (or if not tunneling at all).
- WebSocket: unauthorized connections still receive the stream but their control
  messages are ignored (`meta.control:false`).
- HTTP: `/api/start` requires the token.

## Security

localtunnel routes through a public relay (its only speed-bump is a one-time
"click to continue" interstitial). Treat any tunnel as untrusted:

- Prefer `--tunnel` (view-only) unless you specifically want remote control.
- The token protects control, not viewing — anyone with the link can watch.
- For anything sensitive, don't tunnel; keep it localhost.
