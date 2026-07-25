---
name: stream-droid
description: Use when you need to see or drive an Android emulator/device — screenshot the screen, read its on-screen UI, or tap/type/swipe/press keys (testing, automating, or exploring an Android app). Uses the stream-droid server.
license: MIT
compatibility: Requires a running stream-droid server and `adb`; the helper scripts run on bun or node ≥ 18.
metadata:
  version: '0.1.0'
---

# stream-droid

## Overview

Drive a running Android emulator or device through a **stream-droid** server:
screenshot the screen, read the accessibility/view hierarchy, and inject
tap/swipe/type/key input. Prefer targeting **elements** (by resource-id or text)
over raw pixels — it survives layout/resolution changes.

## When to use

- You need to interact with an Android screen: tap a button, type into a field,
  scroll, press Back/Home, launch an app, verify what's shown.
- Testing/automating/exploring an Android app on an emulator or device.
- You want the agent's actions mirrored in a browser a human can watch.

## Prerequisites

Start the server once (headless — no browser). From the stream-droid repo:

```bash
bun run src/server.ts -d          # add a name to pin a device: … Pixel_9 -d
```

`adb` must see a device (`adb devices`). Verify everything is ready with the
bundled check (bun, adb, a device, a reachable server):

```bash
bun scripts/check.mjs              # exits 0 when ready, 1 with what's missing
```

The scripts talk to the server on `localhost:3200` (override with
`--port` / `STREAM_DROID_PORT`). They're plain ESM and run under **bun or
node ≥ 18** (`node scripts/…`) — only the server itself requires bun.

## The loop

1. **Look** — `bun scripts/drive.mjs shot` → open `screen.png` to see the current screen.
2. **Read** — `bun scripts/drive.mjs ui` → clickable elements with id / text / center.
3. **Act** — tap an element (robust) or coordinates; type; press keys.
4. Repeat: screenshot again to confirm the result.

## Quick reference

`scripts/drive.mjs` — run with `bun` or `node` from this skill dir:

| Command | Does |
|---|---|
| `bun scripts/drive.mjs devices` | list running devices (`GET /api/state`) |
| `bun scripts/drive.mjs apps [grep]` | list installed packages + current foreground app |
| `bun scripts/drive.mjs launch com.android.settings` | launch an app by package name |
| `bun scripts/drive.mjs shot [file]` | save a screenshot PNG (default `screen.png`) |
| `bun scripts/drive.mjs ui [grep]` | dump UI elements; optional case-insensitive text filter |
| `bun scripts/drive.mjs tap:text "Network & internet"` | tap the element whose text/desc contains this |
| `bun scripts/drive.mjs tap:id search` | tap by resource-id (full or the tail after `/`) |
| `bun scripts/drive.mjs tap 0.5 0.5` | tap normalized `[0..1]` coordinates |
| `bun scripts/drive.mjs swipe 0.5 0.8 0.5 0.2` | swipe (normalized) — e.g. scroll up |
| `bun scripts/drive.mjs text "hello world"` | type text into the focused field |
| `bun scripts/drive.mjs key Home` | Enter · Backspace · Tab · Home · Back · AppSwitch · Arrow{Up,Down,Left,Right} |

Target a specific device with `--serial <serial|avd>` (or `$STREAM_DROID_SERIAL`);
otherwise the first running device is used. Coordinates are normalized `[0..1]`,
so they're resolution-independent.

Under the hood these are the server's own APIs — you can call them directly:
`GET /api/hierarchy?serial=…` (elements) and WebSocket control messages
`{type:"tapElement"|"tap"|"swipe"|"text"|"key", …}`. See `bun scripts/drive.mjs --help`.

## Common mistakes

- **Tapping pixels instead of elements.** Use `tap:text` / `tap:id` first; fall
  back to `tap x y` only when nothing matches. Pixel taps break on other screens.
- **Acting blind.** Always `shot` (and/or `ui`) before and after — don't assume
  the tap worked; confirm the screen changed.
- **Server not running / wrong device.** `bun scripts/drive.mjs devices` first; if empty,
  start an emulator (or `bun run src/server.ts <name> -d` to boot one).
- **`tap:text` with the literal `&amp;`.** Text is already decoded — match on the
  real characters (`"Network & internet"`), a substring is fine.
- **Sparse hierarchy on some screens.** Jetpack Compose UIs (e.g. modern
  Settings' `SpaActivity`) expose little to `uiautomator`, so `ui` / `tap:text`
  may come up empty. There, `shot` and use `tap x y` from the screenshot.
- **View-only tunnel.** If the server was started with `--tunnel` (no
  `--tunnel-control`), control is rejected — run the server locally for driving.

## Reference

`drive.mjs` wraps the server. For the full details of each capability, read the
relevant file in [`references/`](references/) (load only what you need):

| File | Covers |
|---|---|
| [references/cli.md](references/cli.md) | every command, flag, and env var |
| [references/emulators.md](references/emulators.md) | list / boot (headless) / kill AVDs, targeting |
| [references/capture-backends.md](references/capture-backends.md) | `screenrecord` · `scrcpy` · `grpc` |
| [references/input-control.md](references/input-control.md) | tap / swipe / type / keys, coordinates, input paths |
| [references/semantic-layer.md](references/semantic-layer.md) | UI hierarchy + tap-by-element |
| [references/http-api.md](references/http-api.md) | `/api/state`, `/api/start`, `/api/apps`, `/api/launch`, `/api/hierarchy` |
| [references/websocket.md](references/websocket.md) | the WS stream + control protocol |
| [references/remote-tunnel.md](references/remote-tunnel.md) | public link + QR, view-only vs control |
| [references/browser-ui.md](references/browser-ui.md) | the web UI |
| [references/agent-skill.md](references/agent-skill.md) | this helper, in depth |
