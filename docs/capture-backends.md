# Capture backends

How the screen is streamed. Pick with `--capture` (or `CAPTURE=`). The choice
sets the wire codec, which the client renders as `<video>` (H.264 via jMuxer/MSE)
or `<canvas>` (PNG frames).

| | `screenrecord` (default) | `scrcpy` | `grpc` |
|---|---|---|---|
| Stream | H.264 → `<video>` | H.264 → `<video>` | PNG frames → `<canvas>` |
| Extra setup | none | none — v4.1 jar auto-downloads | none (emulator gRPC) |
| Works on | any device | any device | **emulator only** |
| FPS / latency | ok (~200–400 ms) | high FPS, lower latency | frame-driven (updates on change) |
| Notes | ~3 min clip, auto-respawned | continuous; Android 14/15/16 via DisplayManager | server-side PNG (CPU-heavy at high fps); also exposes sensors/GPS/battery |

## screenrecord (default)

Zero setup: `adb exec-out screenrecord --output-format=h264 -`, respawned every
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

**Getting the jar — you don't have to.** On the first `--capture scrcpy` run,
stream-droid downloads the server component (~730 KB, no scrcpy desktop app
needed), **verifies its SHA-256** against a pinned value, and caches it in
`~/.cache/stream-droid/` (respects `XDG_CACHE_HOME`); later runs reuse the cache
silently. It logs `✓ downloaded scrcpy-server v4.1 (verified) → …` when it does.
To supply your own instead (offline, air-gapped, or a custom build):

```bash
curl -L -o scrcpy-server-v4.1 \
  https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-server-v4.1
bun run src/server.ts --capture scrcpy --scrcpy-server ./scrcpy-server-v4.1
```

**Version pinning matters.** scrcpy's server verifies that the version string we
pass **exactly** matches the jar's build version, and its socket/stream protocol
changes between majors. stream-droid targets **v4.1** and requests
`raw_stream=true` — a pure H.264 Annex-B stream with no framing, no device
header, and none of the 12-byte session-meta blocks scrcpy otherwise injects
mid-stream on rotation (which would corrupt the decoder feed). The version is
pinned in `src/capture/scrcpy.ts` and `scrcpyServer.ts`; moving to a new release
means updating both the version string and the pinned download + checksum, and
re-checking the protocol. (v1.24 and older will **crash on Android 14+** — they
use `SurfaceControl.createDisplay`, removed in Android 14.)

## grpc (emulator only)

Talks to the emulator's `EmulatorController` gRPC service (discovered from
`pid_*.ini`, authenticated with the `grpc.token` bearer token). It needs no jar
and no adb for capture — the cleanest programmatic hook — but is emulator-only.
Video is `streamScreenshot` (PNG); input is `sendTouch`/`sendKey`.

```bash
CAPTURE=grpc bun run src/server.ts
```

Frame-driven: an idle screen produces no new frames until it changes.
