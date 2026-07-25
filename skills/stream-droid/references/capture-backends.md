# Capture backends

How the screen is streamed. Pick with `--capture` (or `CAPTURE=`). The choice
sets the wire **codec**, which the client renders differently.

| | `screenrecord` (default) | `scrcpy` | `grpc` |
|---|---|---|---|
| Wire | H.264 → `<video>` (jMuxer/MSE) | H.264 → `<video>` | PNG frames → `<canvas>` |
| Works on | any device | any device | **emulator only** |
| Extra setup | none | none — v4.1 jar auto-downloads | none |
| Latency / FPS | ok (~200–400 ms) | high FPS, low latency | frame-driven (updates on change) |
| Notes | ~3 min clip, auto-respawned | continuous; Android 14/15/16 via DisplayManager | server-side PNG (CPU-heavy at high fps); also exposes sensors/GPS/battery |

All three also send an instant PNG **poster** so a preview shows immediately —
see [websocket.md](websocket.md) and [browser-ui.md](browser-ui.md).

## screenrecord

Zero setup. `adb exec-out screenrecord --output-format=h264 -`, respawned every
~3 min (its clip limit). H.264 over the WebSocket, decoded by jMuxer into MSE.

```bash
bun run src/server.ts            # this is the default
```

## scrcpy

Higher FPS / lower latency, continuous. Uses the **scrcpy-server v4.1** jar
(older versions crash on Android 14+). Video only, `raw_stream=true` (a clean
H.264 Annex-B stream); input is a separate control socket.

```bash
bun run src/server.ts --capture scrcpy      # jar auto-downloads on first use
```

On the first run with no jar, it downloads the pinned v4.1 server (~730 KB),
**verifies its SHA-256**, and caches it in `~/.cache/stream-droid/` (honors
`XDG_CACHE_HOME`); later runs reuse the cache. To supply your own instead:

```bash
bun run src/server.ts --capture scrcpy --scrcpy-server ./scrcpy-server-v4.1
```

- The jar is pinned to **v4.1** — the server verifies the version string and
  hard-fails on a mismatch, so a custom `--scrcpy-server` must be that build.
- `--scrcpy-control off` routes input via `adb input` instead of scrcpy's socket.

## grpc (emulator only)

Talks to the emulator's `EmulatorController` gRPC service — no jar, no adb for
capture. Video is `streamScreenshot` (PNG); input is `sendTouch`/`sendKey`. The
endpoint + token are discovered from the emulator's `pid_*.ini`
(`grpc.port` + `grpc.token`); auth is `authorization: Bearer <token>`.

```bash
CAPTURE=grpc bun run src/server.ts
```

Frame-driven: an idle screen produces no new frames until it changes.

## Preflight

The server checks requirements on start and fails with guidance: `adb` missing →
exit; `--capture scrcpy` with no jar → auto-download the pinned v4.1 jar (a bad
`--scrcpy-server` path exits with a hint); unknown `--capture` → exit; missing
SDK `emulator` → warn and continue.
