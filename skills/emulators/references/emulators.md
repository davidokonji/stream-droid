# Emulators & devices

Everything is keyed by a **device**: an adb **serial** (`emulator-5554`) or an
**AVD name** (`Pixel_9`). The two are interchangeable wherever a device is
accepted; matching is case-insensitive. AVDs are listed/booted with the SDK
`emulator` binary (found via `ANDROID_HOME`/`ANDROID_SDK_ROOT` or PATH); running
devices come from `adb devices`.

Manage them through the shared `drive.mjs` helper, which uses the server's API —
so there's nothing to run from source. `node scripts/drive.mjs …` from the drive
skill dir (or `node skills/drive/scripts/drive.mjs …` from a clone).

## List

```bash
node scripts/drive.mjs avds
# ⚪ stopped  Galaxy_Samsung_A55
# 🟢 running  Pixel_9  emulator-5554
# ⚪ stopped  Pixel_7_API_34
```

Reads `GET /api/state`, which returns `avds` (name/running/serial), `devices`
(serial/avd), and the pinned `target`.

## Boot

```bash
node scripts/drive.mjs boot Pixel_9 --headless   # omit --headless for a windowed one
```

Posts to `POST /api/start` with `{ "avd": "Pixel_9", "headless": true }`. Headless
runs `emulator -avd <name> -no-window -no-audio` — fully adb/stream-capable with no
GUI on the host. Boot takes ~20–60 s; poll `avds` until it flips to 🟢. (You can
also click **Start** on a ⚪ row in the browser sidebar.)

## Kill

```bash
node scripts/drive.mjs kill Pixel_9        # or a serial; emulators only
```

Posts to `POST /api/stop`, which runs `adb -s <serial> emu kill`. Physical devices
can't be shut down this way.

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
