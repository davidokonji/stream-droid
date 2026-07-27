---
name: share
description: Use when you need to share a live stream-droid session with someone else — expose it as a public URL with a scannable QR, view-only by default or controllable.
license: MIT
compatibility: Runs via the `stream-droid` CLI (bun or node ≥ 20); the public relay is localtunnel.
metadata:
  version: '0.4.7'
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

**First visit shows a localtunnel reminder.** On their first open, a recipient
sees a "You are about to visit…" interstitial from localtunnel (not stream-droid)
that displays the tunnel's IP and asks them to re-type it to continue — a built-in
anti-abuse gate on the free relay. It's shown once per visitor; they enter the IP
shown and proceed, then the session loads. It can't be removed on localtunnel.

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
