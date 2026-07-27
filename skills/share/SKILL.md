---
name: share
description: Use when you need to share a live stream-droid session with someone else — expose it as a public URL with a scannable QR, view-only by default or controllable.
license: MIT
compatibility: Runs via the `stream-droid` CLI (bun or node ≥ 20); public relay is cloudflared (default, no interstitial) or localtunnel.
allowed-tools:
  - Bash(drive *)
metadata:
  version: '0.4.6'
---

# share

## Overview

Expose a running stream-droid session over a public URL with a scannable QR in
the terminal, so someone on another device can watch — or, if you allow it,
control. Sharing is **view-only by default**; control is gated by a token.

## When to use

- You want a teammate to watch the device you're driving.
- You want to hand someone remote control of the session.

## Commands

Use the `stream-droid` CLI — `npx stream-droid …` (or `bunx stream-droid …`).

```bash
npx stream-droid --tunnel          # -t : share a VIEW-ONLY public link + QR
npx stream-droid --tunnel-control  # -tc: the shared link can also CONTROL
```

On start it prints the public link and a QR to scan.

## Stopping the share

Stop sharing **without killing the server** (the emulator keeps running and you can
keep driving it locally):

```bash
drive tunnel stop      # close the public link; drive tunnel status shows current state
```

The local browser also shows a **🔗 Sharing … · Stop sharing** bar while a tunnel
is live — clicking it does the same. (Killing the whole server process, e.g. Ctrl-C,
also tears the tunnel down.)

## Relay: cloudflared (default) vs localtunnel

Two backends. **cloudflared** (the default) gives a `*.trycloudflare.com` link with
**no visitor reminder page**. Its binary comes from the bundled `cloudflared` npm
package — fetched once on first use, or a system `cloudflared` is reused if present —
so there's nothing to install. **localtunnel** is the fallback (used if cloudflared
can't start, or with `--tunnel-backend localtunnel`), but shows a one-time
interstitial (below). Force a backend with `--tunnel-backend cloudflared|localtunnel`
(default `auto`).

**localtunnel's first-visit reminder.** On their first open, a recipient of a
`*.loca.lt` link sees a "You are about to visit…" interstitial from localtunnel
(not stream-droid) that shows the tunnel's IP and asks them to re-type it — a
built-in anti-abuse gate on the free relay, shown once per visitor. It **can't** be
removed on localtunnel; the default cloudflared backend avoids it entirely.

## View-only vs control (important)

- `--tunnel` shares a **view-only** link — viewers watch but can't drive. The
  local auto-opened browser keeps a control token, so *you* can still drive.
- `--tunnel-control` bakes the control token into the shared link — anyone who
  opens it can control the device.
- A forwarded screenshot of a view-only link can't drive anything; only a link
  carrying the token can.

## Security

localtunnel is a **public relay** — treat any tunnel as untrusted:

- Prefer `--tunnel` (view-only) unless you specifically need remote control.
- The token protects control, not viewing — anyone with the link can watch.
- For anything sensitive, don't tunnel; keep it on localhost.

## Reference

| File | Covers |
|---|---|
| [references/remote-tunnel.md](references/remote-tunnel.md) | the tunnel, the token gate, view-only vs control, security |
