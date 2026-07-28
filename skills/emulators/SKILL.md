---
name: emulators
description: Use when you need an Android emulator running to build/test a mobile app (Expo, React Native, Flutter, native Android) — list, boot (optionally headless), or shut down AVDs for a stream-droid session, e.g. start a specific AVD before driving it, see what's running, or kill one when done.
license: MIT
compatibility: Requires `adb`; booting/listing AVDs needs the Android SDK `emulator` and at least one AVD. Goes through the drive skill's helper (node or bun ≥ 18).
allowed-tools:
  - Bash(drive *)
  - Bash(stream-droid-server)
  - Bash(stream-droid-server *)
metadata:
  version: '0.4.6'
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

## Prerequisites

A server (emulator management goes through its API). If one isn't up, start it
quietly (and stop it when you're done — it runs in the background):

```bash
stream-droid-server          # start (headless)
stream-droid-server --stop   # stop when done
# from a clone: node skills/drive/scripts/ensure-server.mjs [--stop]
```

## Commands

Everything goes through the shared **`drive`** helper — it talks to the server's
API, so you don't run the CLI or the server yourself. The plugin puts `drive` on
your PATH; call it by name:

```bash
drive avds                     # list every AVD: 🟢 running / ⚪ stopped (+ serial)
drive boot Pixel_9 --headless  # boot an AVD (omit --headless for a windowed one)
drive boot Pixel_9 --cold      # if it won't boot: skip its snapshot, full-boot it
drive health                   # accel/adb/emulator checks + per-device readiness
drive kill Pixel_9             # shut a running emulator down (serial or AVD name)
# from a clone (not installed as a plugin): node skills/drive/scripts/drive.mjs avds
```

- **`avds`** answers "what's running?" from the live server state — no CLI needed.
- **`boot`** starts the AVD; it takes ~20–60 s to come online. Poll `avds` (or the
  drive skill's `devices`) until it shows 🟢, then drive it with **`/stream-droid:drive`**.
- **`health`** reports whether the machine can boot AVDs at all (hardware accel),
  that `adb`/`emulator` are present, and whether each running device's framework is
  up (`✓ ready` vs `⏳ starting`).
- **An AVD that never comes online** usually has a corrupt saved snapshot. Re-boot it
  with **`--cold`** (`-no-snapshot-load`) to skip the snapshot and full-boot it — the
  browser offers the same as a one-click **Cold-boot** on its boot-timeout notice.
- **`kill`** uses `adb emu kill` under the hood; physical devices can't be shut down
  this way.

## Common mistakes

- **No SDK `emulator` / no AVDs.** Listing and booting AVDs needs the SDK
  `emulator` binary (via `ANDROID_HOME`/`ANDROID_SDK_ROOT` or `PATH`) and at least
  one AVD. Streaming an already-running device works without it.
- **Trying to `kill` a physical device.** Only emulators respond to `adb emu kill`.

## Reference

| File | Covers |
|---|---|
| [references/emulators.md](references/emulators.md) | list / boot (headless, cold) / kill / health, device targeting, auto-stream order |
