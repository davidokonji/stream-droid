# Remote sharing (`--tunnel`)

`--tunnel` publishes the session over
[localtunnel](https://github.com/localtunnel/localtunnel) and prints a
**scannable QR** to the terminal, so someone on another network can watch (or
drive) the device in their browser.

## View-only by default

The shared link is **view-only by default** — remote viewers watch but can't
drive the device, and `/api/start` and control messages are rejected. Control is
gated by a random token: the local auto-opened browser gets it (`?k=…`), so *you*
keep control; a forwarded view link cannot. Viewers see a **👁 view-only** badge.

## Sharing control

Use **`--tunnel-control`** to bake the token into the shared link so whoever scans
it can drive too.

```bash
bun run src/server.ts --tunnel            # public link + QR, view-only
bun run src/server.ts --tunnel-control    # public link + QR, controllable
```

> localtunnel routes through a public relay — treat any tunnel as untrusted.
> Prefer `--tunnel` (view-only) unless you specifically want remote control, and
> tear it down when you're done. See also the [security posture](setup.md#security-posture).
