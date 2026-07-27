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

Reads `GET /api/state`, which returns `avds` (name/running/serial/booted/bootError),
`devices` (serial/avd), and the pinned `target`. An AVD whose last boot crashed
shows as `⚠ failed  <name>  — <reason>` (the emulator's own error, e.g. `unknown
skin name '…'`), so you don't have to guess why it never came online.

## Boot

```bash
node scripts/drive.mjs boot Pixel_9 --headless   # omit --headless for a windowed one
```

Posts to `POST /api/start` with `{ "avd": "Pixel_9", "headless": true }`. Headless
runs `emulator -avd <name> -no-window -no-audio` — fully adb/stream-capable with no
GUI on the host. Boot takes ~20–60 s; poll `avds` until it flips to 🟢. (You can
also click **Start** on a ⚪ row in the browser sidebar.)

### Cold boot (won't-start recovery)

```bash
node scripts/drive.mjs boot Pixel_9 --cold   # adds -no-snapshot-load
```

Boots take a fast path by loading the AVD's saved `default_boot` snapshot. If that
snapshot is corrupt the emulator **crashes on every boot** and never reaches adb
(only a crash handler survives). `--cold` sends `{ …, "cold": true }`, adding
`-no-snapshot-load` so it skips the snapshot and does a full boot (slower, ~1–2 min)
— which recovers it. In the browser, a boot that times out shows a **Cold-boot**
button that does the same.

Not every failure is a snapshot, though: the server watches the emulator process
and, if it exits during boot, records **why** (its `ERROR`/`PANIC` line) as the
AVD's `bootError`. So a broken config — e.g. `unknown skin name 'Galaxy_A55_5G'` —
is reported outright (in `avds` and the browser) rather than looking like a slow
boot; cold boot won't fix that, the AVD config will.

## Health

```bash
node scripts/drive.mjs health
# ✓ adb    ✓ emulator    ✓ accel — Hypervisor.Framework OS X Version 26.5
# ✓ ready   emulator-5554  Pixel_9
# ⏳ starting emulator-5556  Galaxy_Samsung_A55
```

Reads `GET /api/health`: `emulator -accel-check` (hardware acceleration — if this
fails, no AVD will boot), `adb`/`emulator` presence, and per running device whether
`sys.boot_completed` is set (`✓ ready` to stream vs `⏳ starting`). A device is
`device` in `adb devices` before Android is actually up, so `ready` is the signal
that it's streamable. The sidebar mirrors this: a running-but-not-ready row shows
🟡 **starting…** instead of a Stream button.

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
