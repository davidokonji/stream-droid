---
name: emulators
description: Use when you need an Android emulator running to build/test a mobile app (Expo, React Native, Flutter, native Android) — list, boot (optionally headless), or shut down AVDs for a stream-droid session, e.g. start a specific AVD before driving it, see what's running, or kill one when done.
license: MIT
compatibility: Requires `adb`; booting/listing AVDs needs the Android SDK `emulator` and at least one AVD. Runs via the `stream-droid` CLI (bun or node ≥ 20).
metadata:
  version: '0.4.1'
---

# emulators

## Overview

Manage the Android emulators (AVDs) behind a stream-droid session: list what's
running or available, boot an AVD (optionally headless), and kill one when done.
A "device" is named by its adb **serial** (`emulator-5554`) or **AVD name**
(`Pixel_9`) — interchangeably, case-insensitive.

Once a device is running, drive it with the **`/stream-droid:drive`** skill.

## When to use

- Nothing shows up under `drive`'s `devices` and you need to boot an emulator.
- You want a specific AVD (not "the first running device").
- You want a headless emulator (no host window — adb/stream only).
- You're done and want to shut an emulator down.

## Commands

Use the `stream-droid` CLI. When installed as a package it's on `PATH`
(`bunx stream-droid …` / `npx stream-droid …`); from a clone use
`bun run src/server.ts …`.

```bash
stream-droid -a                     # list running streams + stopped AVDs, then exit
stream-droid Pixel_9 -d             # boot Pixel_9 (if stopped) and stream it, headless
stream-droid Pixel_9 --headless     # same — the emulator boots with no host window
stream-droid --kill Pixel_9         # shut a running emulator down (emulators only)
```

- Naming a **stopped** AVD boots it, then streams once it's online (~20–60 s).
- `-d` / `--headless` starts the server without opening a browser; the emulator
  itself boots windowless. (These are two different "headless" notions — see the
  reference.)
- `--kill` uses `adb emu kill`; physical devices can't be shut down this way.

To confirm what's running without booting anything, the drive helper also lists
devices: `bun "$CLAUDE_PLUGIN_ROOT/skills/drive/scripts/drive.mjs" devices`
(from a clone: `bun skills/drive/scripts/drive.mjs devices`).

## Common mistakes

- **No SDK `emulator` / no AVDs.** Listing and booting AVDs needs the SDK
  `emulator` binary (via `ANDROID_HOME`/`ANDROID_SDK_ROOT` or `PATH`) and at least
  one AVD. Streaming an already-running device works without it.
- **Trying to `--kill` a physical device.** Only emulators respond to `adb emu kill`.

## Reference

| File | Covers |
|---|---|
| [references/emulators.md](references/emulators.md) | list / boot (headless) / kill, device targeting, auto-stream order |
