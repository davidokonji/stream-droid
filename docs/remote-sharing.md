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

## Link previews

While a tunnel is open the page carries Open Graph tags, so pasting the share link
into Slack, iMessage or similar unfurls it with the **QR as the preview image** —
handy when the link lands on a desktop and you want the device on your phone.

The preview image is served unauthenticated at `/og-qr.png`, because the service
generating the preview fetches it anonymously. It encodes the same link that was
shared, so **in control mode the QR contains the control token**: anyone who can
reach the tunnel — including a view-only viewer — can fetch that image and scan the
token out of it, and the preview service keeps a cached copy. If that matters for a
given session, share view-only, where the QR carries no token. With no tunnel open
the route 404s and no tags are emitted.

> localtunnel routes through a public relay — treat any tunnel as untrusted.
> Prefer `--tunnel` (view-only) unless you specifically want remote control, and
> tear it down when you're done. See also the [security posture](setup.md#security-posture).
