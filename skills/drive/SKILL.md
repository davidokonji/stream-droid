---
name: drive
description: Use when building, testing, debugging, or exploring a mobile app on Android — Expo, React Native, Flutter, Jetpack Compose, or native Android (Kotlin/Java) — and you need to see or drive the emulator/device: screenshot the screen, read its on-screen UI, or tap/type/swipe/press keys. Uses the stream-droid server.
license: MIT
compatibility: Requires `adb` and a running device; the helper scripts run on node or bun ≥ 18 and start the stream-droid server for you.
allowed-tools:
  - Bash(drive *)
  - Bash(stream-droid-server)
  - Bash(stream-droid-check)
metadata:
  version: '0.4.9'
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

`adb` must see a device (`adb devices`). The plugin puts three commands on your
PATH — `drive` (the helper), `stream-droid-server` (start the server), and
`stream-droid-check` (verify the setup) — so you call them by name, no paths.

Get a server ready — this starts it headless if one isn't already up, and stays
quiet:

```bash
stream-droid-server        # runs under node (or bun)
```

Optionally sanity-check the whole setup (node/bun, adb, a device, the server):

```bash
stream-droid-check         # exits 0 when ready, 1 with what's missing
```

The commands target `localhost:3200` (override with `--port` / `STREAM_DROID_PORT`)
and run under **node or bun ≥ 18**. From a clone (not installed as a plugin), call
the scripts directly instead: `node skills/drive/scripts/drive.mjs …` (and
`…/ensure-server.mjs`, `…/check.mjs`).

## The loop

1. **Look** — `drive shot` → open `screen.png` to see the screen.
2. **Read** — `drive ui` → clickable elements with id / text / center.
3. **Act** — tap an element (robust) or coordinates; type; press keys.
4. Repeat: screenshot again to confirm the result changed.

## Quick reference

`drive` — the helper, on your PATH once the plugin is enabled:

| Command | Does |
|---|---|
| `drive devices` | list running devices |
| `drive shot [file]` | save a screenshot PNG (default `screen.png`) |
| `drive record [secs] [file]` | record the screen to MP4 (default 10s, `screen.mp4`) |
| `drive logcat [grep] [--lines N]` | pretty-print recent device logcat (default 200 lines) |
| `drive ui [grep]` | dump UI elements; optional case-insensitive text filter |
| `drive tap:text "Network & internet"` | tap the element whose text/desc contains this |
| `drive tap:id search` | tap by resource-id (full or the tail after `/`) |
| `drive tap 0.5 0.5` | tap normalized `[0..1]` coordinates |
| `drive longpress 0.5 0.5 [ms]` | press and hold (default 500ms) |
| `drive swipe 0.5 0.8 0.5 0.2` | swipe (normalized) — e.g. scroll up |
| `drive scroll 0.5 0.5 0.5` | scroll at a point by `dy` (and optional `dx`) |
| `drive text "hello world"` | type text into the focused field |
| `drive key VolumeUp` | keys — nav, media, volume, power (see below) |

(App control — `apps` / `launch` — lives in the **`/stream-droid:apps`** skill.)

Key names: `Enter` `Backspace` `Tab` `Home` `Back` `AppSwitch` `Escape` `Delete`
`Arrow{Up,Down,Left,Right}` `Page{Up,Down}` `DpadCenter` `Menu` `Search`
`Notifications` `Power` `Camera` `Volume{Up,Down,Mute}` `Media{PlayPause,Next,Previous}`.

Target a specific device with `--serial <serial|avd>` (or `$STREAM_DROID_SERIAL`);
otherwise the first running device is used. Coordinates are normalized `[0..1]`,
so they're resolution-independent. Run `drive --help` for the full list.

**Where files land:** screenshots and recordings save to your project folder
(`$CLAUDE_PROJECT_DIR`, else the folder you run from), so captures stay with your
work rather than a scratch/temp dir. Pass an explicit path to save elsewhere, or
set `--out-dir` / `$STREAM_DROID_OUT_DIR`.

## Common mistakes

- **Tapping pixels instead of elements.** Use `tap:text` / `tap:id` first; fall
  back to `tap x y` only when nothing matches. Pixel taps break on other screens.
- **Acting blind.** Always `shot` (and/or `ui`) before and after — don't assume
  the tap worked; confirm the screen changed.
- **No device.** `drive devices` first; if empty, boot one with the
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
