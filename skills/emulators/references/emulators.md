# Emulators & devices

Everything is keyed by a **device**: an adb **serial** (`emulator-5554`) or an
**AVD name** (`Pixel_9`). The two are interchangeable wherever a device is
accepted; matching is case-insensitive. AVDs are listed/booted with the SDK
`emulator` binary (found via `ANDROID_HOME`/`ANDROID_SDK_ROOT` or PATH); running
devices come from `adb devices`.

## List

```bash
npx stream-droid -a
# Running streams (1):
#   emulator-5554    Pixel_9                  emulator
# Stopped AVDs: Galaxy_Samsung_A55, Pixel_7_API_34, Small_Phone_API_34
```

Or over HTTP while the server runs: `GET /api/state` returns `avds`
(name/running/serial), `devices` (serial/avd), and the pinned `target`.

## Boot

- **CLI:** name a stopped AVD; it boots and streams once online:
  `npx stream-droid Pixel_9`.
- **Sidebar:** click **Start** on a ⚪ row (tick **headless** first for no host
  window).
- **API:** `POST /api/start` with `{ "avd": "Pixel_9", "headless": true }`.

Booting an AVD with **headless** runs `emulator -avd <name> -no-window -no-audio`
— fully adb/stream-capable with no GUI on the host. Boot takes ~20–60 s; the
sidebar polls `/api/state` every 3 s and flips 🟢/⚪.

> The server's `-d`/`--headless` (don't open the browser) is a **different**
> thing from the *emulator's* headless boot (`-no-window`).

## Kill

```bash
npx stream-droid --kill Pixel_9        # or a serial; emulators only
```

Uses `adb -s <serial> emu kill`. Physical devices can't be shut down this way.

## Which device gets streamed

Resolution order (`resolveSerial`): an explicit request (WS `?serial=`) →
the CLI **target** (`name`/`--serial`/…) → the first running device. The browser
auto-streams the pinned target if it's running, else the first device. Only one
stream per client at a time; the sidebar's active row and the LIVE badge show
which.

## Requirements

- `adb` on PATH (mandatory for everything).
- SDK `emulator` + at least one AVD (only for listing/booting from the sidebar;
  streaming an already-running device works without it — you'll get a warning).
