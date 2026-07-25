# CLI

Run the server or a one-shot command. `src/server.ts` is the entry; the published
`bin` (`bin/stream-droid.mjs`) runs it under **bun or node** — `bunx stream-droid`
or `npx stream-droid`.

```bash
bun run src/server.ts [name] [options]     # dev
bun start                                   # build assets, then run (opens browser)
./src/server.ts [name] [options]            # after `bun link`: `stream-droid …`
bun run src/server.ts -h                    # full help
```

`name` (a bare argument) is the device to stream — an adb serial or an AVD name.
If it's a stopped AVD, it's booted and streamed once online.

## Commands (run and exit)

| Command | Effect |
|---|---|
| `-h`, `--help` | print usage and exit |
| `-a`, `--list` | list running streams + stopped AVDs |
| `--kill [name]` | shut down a running emulator (emulators only) |
| `-l`, `--log` | stream the device's logcat, colourised by level (no HTTP server) |

`--kill`/`-l` target the `[name]`/positional/`--serial`, else the first device.

## Options (server mode)

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--port <n>` | `PORT` | `3200` | HTTP + WS port |
| `--serial <s>` | `ANDROID_SERIAL` | first device | device to stream (serial or AVD name) |
| `--emulator <s>` / `--avd <s>` | — | — | aliases for `--serial` |
| `--capture <mode>` | `CAPTURE` | `screenrecord` | `screenrecord` · `scrcpy` · `grpc` — see [capture-backends.md](capture-backends.md) |
| `--scrcpy-server <path>` | `SCRCPY_SERVER_JAR` | auto-download | scrcpy-server jar (scrcpy mode); omit to auto-download + SHA-256-verify the pinned v4.1 jar |
| `--scrcpy-control <v>` | `SCRCPY_CONTROL` | `on` | `off` → route input via `adb input` in scrcpy mode |
| `-d`, `--headless` | `STREAM_DROID_HEADLESS=1` | off | don't auto-open the browser (server still runs) |
| `-v`, `--verbose` | `STREAM_DROID_VERBOSE=1` | off | show logs — quiet by default (only errors); `-v` prints info/warn/debug + timestamps |
| `-t`, `--tunnel` | — | off | public link + QR, **view-only** — see [remote-tunnel.md](remote-tunnel.md) |
| `-tc`, `--tunnel-control` | — | off | tunnel with a **controllable** shared link |

## Examples

```bash
bun run src/server.ts                                  # stream the running device, open browser
bun run src/server.ts Pixel_9 -d                       # boot+stream Pixel_9, no browser
bun run src/server.ts --capture scrcpy                 # v4.1 jar auto-downloads on first use
bun run src/server.ts --port 4000 --serial emulator-5554
bun run src/server.ts --tunnel-control                 # share a controllable public link + QR
CAPTURE=grpc bun run src/server.ts -d                  # gRPC backend, headless
bun run src/server.ts -a                               # list, then exit
bun run src/server.ts --kill Pixel_9                   # shut it down
bun run src/server.ts -l                               # colourised logcat
```

## Notes

- On first server run, the browser assets are built automatically
  (`public/app.css`, `public/client.js`), so no separate build step is needed.
- Startup prints the URL, running devices, the pinned target, and (in tunnel
  mode) the local control link.
