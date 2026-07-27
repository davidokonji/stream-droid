---
name: apps
description: Use when you need to work with apps on an Android emulator/device via stream-droid — list installed packages, see the current foreground app, or launch an app (e.g. your Expo / React Native / Flutter / native Android build under test) by package name before driving it.
license: MIT
compatibility: Requires `adb` and a running device + stream-droid server; the helper runs on bun or node ≥ 18.
metadata:
  version: '0.4.1'
---

# apps

## Overview

Work with apps on a running Android device through stream-droid: list installed
packages, see what's in the foreground, and launch an app by package name. Then
drive it with the **`/stream-droid:drive`** skill.

## When to use

- You need to open a specific app before interacting with it.
- You want to find an app's package name, or check which app is in front.

## Prerequisites

A device and a server. If one isn't up yet, the drive skill's helper starts it:

```bash
bun "$CLAUDE_PLUGIN_ROOT/skills/drive/scripts/ensure-server.mjs"
# from a clone: bun skills/drive/scripts/ensure-server.mjs
```

## Commands

App control is part of the shared `drive.mjs` helper (in the `drive` skill):

```bash
# installed as a plugin:
D="$CLAUDE_PLUGIN_ROOT/skills/drive/scripts/drive.mjs"
bun "$D" apps                       # list installed packages + the foreground app
bun "$D" apps settings              # filter packages by substring
bun "$D" launch com.android.settings  # launch an app by package name

# from a clone, the path is just:
bun skills/drive/scripts/drive.mjs apps
```

After `launch`, switch to **`/stream-droid:drive`** and `shot` / `ui` to confirm
the app opened, then interact.

## Common mistakes

- **Guessing the package name.** Run `apps <grep>` to find the real
  `com.example.app` id before `launch`.
- **Assuming it opened.** Screenshot (`drive` → `shot`) after `launch` — a bad
  package name silently does nothing.

## Reference

| File | Covers |
|---|---|
| [references/apps.md](references/apps.md) | listing packages, the foreground app, launching by package |
