# CLI

Run the `stream-droid` CLI with **`npx stream-droid …`** (or `bunx stream-droid …`)
— no global install needed, works under node or bun.

```bash
npx stream-droid [name] [options]          # stream (default: the running device)
npx stream-droid -h                        # full help
```

(Contributors working in a clone can run the source directly with
`bun run src/server.ts …` / `bun start`, but that's not needed to use the tool.)

`name` (a bare argument) is the device to stream — an adb serial or an AVD name.
If it's a stopped AVD, it's booted and streamed once online.

## Commands (run and exit)

| Command | Effect |
|---|---|
| `-h`, `--help` | print usage and exit |
| `-a`, `--list` | list running streams + stopped AVDs |
| `--kill [name]` | shut down a running emulator (emulators only) |
| `-l`, `--log`, `--logcat` | stream the device's logcat, colourised by level (no HTTP server) |

`--kill`/`-l` target the `[name]`/positional/`--serial`, else the first device.

## Options (server mode)

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--port <n>` | `PORT` | `3200` | HTTP + WS port |
| `--serial <s>` | `ANDROID_SERIAL` | first device | device to stream (serial or AVD name) |
| `--emulator <s>` / `--avd <s>` | — | — | aliases for `--serial` |
| `--capture <mode>` | `CAPTURE` | `screenrecord` | `screenrecord` · `scrcpy` · `grpc` — see [docs/capture-backends.md](../../../docs/capture-backends.md) |
| `--max-size <px>` | `STREAM_DROID_MAX_SIZE` | `0` (native) | downscale capture so its longer edge ≤ px (h264 backends) |
| `--bit-rate <n>` | `STREAM_DROID_BIT_RATE` | backend default | encoder bit-rate — `4000000`, `3M`, `800K` (h264 backends) |
| `--scrcpy-server <path>` | `SCRCPY_SERVER_JAR` | auto-download | scrcpy-server jar (scrcpy mode); omit to auto-download + SHA-256-verify the pinned v4.1 jar |
| `--scrcpy-control <v>` | `SCRCPY_CONTROL` | `on` | `off` → route input via `adb input` in scrcpy mode |
| `-d`, `--headless` | `STREAM_DROID_HEADLESS=1` | off | don't auto-open the browser (server still runs) |
| `-v`, `--verbose` | `STREAM_DROID_VERBOSE=1` | off | show logs — quiet by default (only errors); `-v` prints info/warn/debug + timestamps |
| `-t`, `--tunnel` | — | off | public link + QR, **view-only** — see the [`share` skill](../../share/references/remote-tunnel.md) |
| `-tc`, `--tunnel-control` | — | off | tunnel with a **controllable** shared link |

## Examples

```bash
npx stream-droid                                  # stream the running device, open browser
npx stream-droid Pixel_9 -d                       # boot+stream Pixel_9, no browser
npx stream-droid --capture scrcpy                 # v4.1 jar auto-downloads on first use
npx stream-droid --port 4000 --serial emulator-5554
npx stream-droid --tunnel-control                 # share a controllable public link + QR
CAPTURE=grpc npx stream-droid -d                  # gRPC backend, headless
npx stream-droid -a                               # list, then exit
npx stream-droid --kill Pixel_9                   # shut it down
npx stream-droid -l                               # colourised logcat
```

## Notes

- On first server run, the browser assets are built automatically
  (`public/app.css`, `public/client.js`), so no separate build step is needed.
- Startup prints the URL, running devices, the pinned target, and (in tunnel
  mode) the local control link.
