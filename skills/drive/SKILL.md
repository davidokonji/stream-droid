---
name: drive
description: Use when building, testing, debugging, or exploring a mobile app on Android — Expo, React Native, Flutter, Jetpack Compose, or native Android (Kotlin/Java) — and you need to see or drive the emulator/device: screenshot the screen, read its on-screen UI, or tap/type/swipe/press keys. Uses the stream-droid server.
license: MIT
compatibility: Requires `adb` and a running device; the helper scripts run on bun or node ≥ 18 and start the stream-droid server for you.
metadata:
  version: '0.2.0'
---

# drive

## Overview

See and drive a running Android emulator or device: screenshot the screen, read
the on-screen UI, and inject tap/swipe/type/key input. Prefer targeting
**elements** (by resource-id or text) over raw pixels — it survives
layout/resolution changes.

The helper scripts talk to a local **stream-droid** server and start it for you,
so you don't manage the server yourself.

## When to use

- You need to interact with an Android screen: tap a button, type into a field,
  scroll, press Back/Home, verify what's shown.
- Testing / automating / exploring an Android app on an emulator or device.
- You want your actions mirrored in a browser a human can watch.

For related tasks there are sibling skills in this plugin:
- **`/stream-droid:emulators`** — list, boot (headless), or kill AVDs.
- **`/stream-droid:apps`** — list installed packages, launch or foreground an app.
- **`/stream-droid:share`** — expose the session as a public link + QR.

## Prerequisites

`adb` must see a device (`adb devices`). Then get a server ready — this starts it
headless if one isn't already up, and stays quiet:

```bash
bun scripts/ensure-server.mjs        # or: node scripts/ensure-server.mjs
```

Optionally sanity-check the whole setup (bun/node, adb, a device, the server):

```bash
bun scripts/check.mjs                 # exits 0 when ready, 1 with what's missing
```

The scripts target `localhost:3200` (override with `--port` / `STREAM_DROID_PORT`)
and run under **bun or node ≥ 18**.

## The loop

1. **Look** — `bun scripts/drive.mjs shot` → open `screen.png` to see the screen.
2. **Read** — `bun scripts/drive.mjs ui` → clickable elements with id / text / center.
3. **Act** — tap an element (robust) or coordinates; type; press keys.
4. Repeat: screenshot again to confirm the result changed.

## Quick reference

`scripts/drive.mjs` — run with `bun` or `node` from this skill dir:

| Command | Does |
|---|---|
| `bun scripts/drive.mjs devices` | list running devices |
| `bun scripts/drive.mjs shot [file]` | save a screenshot PNG (default `screen.png`) |
| `bun scripts/drive.mjs record [secs] [file]` | record the screen to MP4 (default 10s, `screen.mp4`) |
| `bun scripts/drive.mjs ui [grep]` | dump UI elements; optional case-insensitive text filter |
| `bun scripts/drive.mjs tap:text "Network & internet"` | tap the element whose text/desc contains this |
| `bun scripts/drive.mjs tap:id search` | tap by resource-id (full or the tail after `/`) |
| `bun scripts/drive.mjs tap 0.5 0.5` | tap normalized `[0..1]` coordinates |
| `bun scripts/drive.mjs longpress 0.5 0.5 [ms]` | press and hold (default 500ms) |
| `bun scripts/drive.mjs swipe 0.5 0.8 0.5 0.2` | swipe (normalized) — e.g. scroll up |
| `bun scripts/drive.mjs scroll 0.5 0.5 0.5` | scroll at a point by `dy` (and optional `dx`) |
| `bun scripts/drive.mjs text "hello world"` | type text into the focused field |
| `bun scripts/drive.mjs key VolumeUp` | keys — nav, media, volume, power (see below) |

(App control — `apps` / `launch` — lives in the **`/stream-droid:apps`** skill.)

Key names: `Enter` `Backspace` `Tab` `Home` `Back` `AppSwitch` `Escape` `Delete`
`Arrow{Up,Down,Left,Right}` `Page{Up,Down}` `DpadCenter` `Menu` `Search`
`Notifications` `Power` `Camera` `Volume{Up,Down,Mute}` `Media{PlayPause,Next,Previous}`.

Target a specific device with `--serial <serial|avd>` (or `$STREAM_DROID_SERIAL`);
otherwise the first running device is used. Coordinates are normalized `[0..1]`,
so they're resolution-independent. Run `bun scripts/drive.mjs --help` for the full list.

**Where files land:** screenshots and recordings save to the folder you run the
command from (the active folder), so captures stay with your work. Pass an
explicit path to save elsewhere, or set `--out-dir` / `$STREAM_DROID_OUT_DIR`.

## Common mistakes

- **Tapping pixels instead of elements.** Use `tap:text` / `tap:id` first; fall
  back to `tap x y` only when nothing matches. Pixel taps break on other screens.
- **Acting blind.** Always `shot` (and/or `ui`) before and after — don't assume
  the tap worked; confirm the screen changed.
- **No device.** `bun scripts/drive.mjs devices` first; if empty, boot one with the
  **`/stream-droid:emulators`** skill.
- **`tap:text` with the literal `&amp;`.** Text is already decoded — match on the
  real characters (`"Network & internet"`); a substring is fine.
- **Sparse hierarchy on some screens.** Jetpack Compose UIs (e.g. modern
  Settings' `SpaActivity`) expose little to `uiautomator`, so `ui` / `tap:text`
  may come up empty. There, `shot` and use `tap x y` from the screenshot.
- **View-only session.** If the server was shared view-only (see
  **`/stream-droid:share`**), control is rejected — drive from the local server.

## Reference

Load only what you need:

| File | Covers |
|---|---|
| [references/input-control.md](references/input-control.md) | tap / swipe / type / keys, coordinates, key names |
| [references/semantic-layer.md](references/semantic-layer.md) | reading the UI hierarchy + tap-by-element |
| [references/browser-ui.md](references/browser-ui.md) | the web UI a human can watch |
| [references/cli.md](references/cli.md) | the `stream-droid` CLI: commands, flags, env vars |
| [references/agent-skill.md](references/agent-skill.md) | this helper (`drive.mjs`), in depth |
