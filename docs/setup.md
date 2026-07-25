# Setup & prerequisites

stream-droid drives tools that must already be installed — nothing is bundled.
The server runs a **preflight check** on startup and exits with a specific fix if
a required piece is missing.

## Prerequisites

| # | Requirement | Needed for | How to get it / check |
|---|---|---|---|
| 1 | **bun** (pinned in `.bun-version` → **1.3.11**) | running the app (TS is executed directly) | `curl -fsSL https://bun.sh/install \| bash` · `bun upgrade` · verify `bun --version` matches `.bun-version` |
| 2 | **adb** (Android platform-tools) on `PATH` | **everything** — capture + input. Hard requirement. | `brew install --cask android-platform-tools`, or add `$ANDROID_HOME/platform-tools` to `PATH`. Verify `adb version` |
| 3 | A running **device or emulator** | something to stream | `adb devices` should list one as `device` |
| 4 | **Android SDK `emulator`** + `ANDROID_HOME` | the sidebar's **list / boot AVDs** (optional — streaming an already-running device works without it) | Set `ANDROID_HOME` (e.g. `~/Library/Android/sdk`) or put the `emulator` dir on `PATH`. Verify `emulator -list-avds` |
| 5 | At least one **AVD** | booting an emulator from the sidebar | Create in Android Studio → Device Manager, or `avdmanager create avd` |
| 6 | **scrcpy-server v4.1** jar | **only** if you use `--capture scrcpy` | **Auto-downloaded** on first use (SHA-256 verified, cached in `~/.cache/stream-droid`) — needs network once. Or pass your own with `--scrcpy-server <path>`. See [capture-backends.md](capture-backends.md). Not needed for the default `screenrecord` backend |

The frontend (React + Tailwind + jMuxer) is bundled by `bun`/`tailwindcss` at
build time — no CDN, no internet needed at runtime. The gRPC backend needs no
extra install (its client ships with `@grpc/grpc-js`), only a running emulator.

> `ANDROID_HOME`/`ANDROID_SDK_ROOT` default-probe `~/Library/Android/sdk` on
> macOS, so on a standard Android Studio install #4 often works with no config.

## Physical devices work too

Everything runs through `adb`, which treats a real phone and an emulator
identically — so capture (screenrecord **and** scrcpy) and input injection work
on a USB- or Wi-Fi-connected device just the same. In fact scrcpy is most
commonly used with physical devices.

- Enable **USB debugging** (Developer Options) and accept the RSA prompt on the
  device — `adb devices` must show it as `device` (not `unauthorized`).
- Wireless works via `adb tcpip 5555` + `adb connect <ip>:5555`, or Android 11+
  wireless debugging.
- It appears in the sidebar as a running row (labelled by its serial, since it
  has no AVD name) with a **Stream** button. The **Start** / headless controls
  are emulator-only — you can't boot a physical device from software.
- `max_size=0` streams at full device resolution; drop it to e.g. `max_size=1280`
  in `src/capture/scrcpy.ts` if a high-res phone's bitrate is too heavy.

## What happens if something's missing

- **No `adb`** → server exits immediately with an install hint.
- **`--capture scrcpy` with no jar** → auto-downloads the pinned v4.1 jar
  (SHA-256 verified) on startup; a bad `--scrcpy-server` path exits with a hint.
- **No `emulator` / `ANDROID_HOME`** → warns, keeps running; sidebar shows
  "No AVDs found" but you can still stream a running device.
- **No device connected** → the browser shows *"no running device — start an
  emulator from the sidebar."*

## Security posture

stream-droid is **localhost-first and has no auth or TLS** of its own: one client
per device is assumed, and `/api/start` will boot any named AVD. Bind it to
localhost (the default) and only expose it deliberately — the optional
[`--tunnel`](remote-sharing.md) adds a view-only-by-default token gate, but the
localtunnel relay is still public. Don't put it on an untrusted network unguarded.
