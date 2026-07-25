# stream-droid reference

How to use each piece of stream-droid — the reference material for the
[`stream-droid` skill](../SKILL.md) and for the codebase generally. Start with
[`cli.md`](cli.md) to run it; the rest documents the protocols and subsystems it
exposes. Load only the file you need.

| Doc | Covers |
|---|---|
| [cli.md](cli.md) | every command, flag, and environment variable |
| [emulators.md](emulators.md) | list / boot (headless) / kill AVDs, device targeting, auto-stream |
| [capture-backends.md](capture-backends.md) | `screenrecord` · `scrcpy` · `grpc` — selecting, setup, tradeoffs |
| [input-control.md](input-control.md) | tap / swipe / type / keys — coordinates, key names, input paths |
| [semantic-layer.md](semantic-layer.md) | UI hierarchy + tap-by-element (id / text) |
| [http-api.md](http-api.md) | `/api/state`, `/api/start`, `/api/hierarchy` |
| [websocket.md](websocket.md) | the WS stream + control protocol (messages, framing) |
| [remote-tunnel.md](remote-tunnel.md) | public link + QR, view-only vs. control token |
| [browser-ui.md](browser-ui.md) | the web UI: sidebar, LIVE, responsive, poster preview |
| [agent-skill.md](agent-skill.md) | driving a device from an AI agent (`drive.mjs`) |

## 30-second tour

```bash
bun install
bun start                         # build + serve + open the browser at :3200
```

The server streams the first running emulator/device; use the sidebar to boot or
switch AVDs. Everything the browser does is available programmatically over the
[HTTP API](http-api.md) and [WebSocket](websocket.md), which is what the
[agent skill](agent-skill.md) uses.

- **See** a device → capture backends stream frames ([capture-backends.md](capture-backends.md)).
- **Drive** it → control messages inject input ([input-control.md](input-control.md)),
  optionally targeting elements ([semantic-layer.md](semantic-layer.md)).
- **Share** it → a tunnel with a scannable QR ([remote-tunnel.md](remote-tunnel.md)).

Conventions: coordinates are normalized `[0..1]`; a "device" is identified by its
adb **serial** (`emulator-5554`) or **AVD name** (`Pixel_9`), interchangeably.
