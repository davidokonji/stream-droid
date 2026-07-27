# The drive helper (scripts/drive.mjs)

Drive a device from an AI agent (or any script) via a stream-droid server. This
skill's entry is [`../SKILL.md`](../SKILL.md); the helpers are in
[`../scripts/`](../scripts/) — `ensure-server.mjs` (start/health), `drive.mjs`
(control), and `check.mjs` (prerequisites).

## Setup

```bash
bun scripts/ensure-server.mjs           # start the server headless if it isn't up
bun scripts/check.mjs                    # verify bun/node, adb, a device, the server
```

`drive.mjs` talks to `localhost:3200` (override with `--port` /
`$STREAM_DROID_PORT`). Pick a device with `--serial <serial|avd>` /
`$STREAM_DROID_SERIAL`, else the first running one is used.

## Commands

Run from the skill dir (`bun scripts/drive.mjs …`) or a clone
(`bun skills/drive/scripts/drive.mjs …`):

| Command | Does |
|---|---|
| `devices` | list running devices |
| `shot [file]` | save a screenshot PNG (default `screen.png`) |
| `record [secs] [file]` | record the screen to MP4 (default 10s, `screen.mp4`) |
| `logcat [grep] [--lines N]` | pretty-print recent device logcat (default 200 lines) |
| `ui [grep]` | list UI elements (`•` = clickable); optional text filter |
| `tap:text "<text>"` | tap the element whose text/desc contains `<text>` |
| `tap:id <resource-id>` | tap by resource-id (full or tail after `/`) |
| `tap <x> <y>` | tap normalized `[0..1]` coords |
| `swipe <x1> <y1> <x2> <y2>` | swipe (normalized) — e.g. `0.5 0.8 0.5 0.2` scrolls up |
| `longpress <x> <y> [ms]` | press and hold (default 500ms) |
| `scroll <x> <y> <dy> [dx]` | scroll at a point |
| `text "<string>"` | type into the focused field |
| `key <Name>` | named key — see [input-control.md](input-control.md) |

App control (`apps` / `launch`) is in the **`/stream-droid:apps`** skill.

## The loop

```bash
bun scripts/drive.mjs shot                          # look → open screen.png
bun scripts/drive.mjs ui internet                   # read → elements matching "internet"
bun scripts/drive.mjs tap:text "Network & internet" # act
bun scripts/drive.mjs shot                          # confirm the screen changed
```

## Notes

- `drive.mjs` wraps the stream-droid server; you don't manage the server or its
  protocol — `ensure-server.mjs` starts it and the helper does the rest.
- `shot` and `record` save to the active folder (where you ran the command) by
  default — pass a path or set `--out-dir` / `$STREAM_DROID_OUT_DIR` to change it.
- Always screenshot before/after — don't assume an action landed.
- Prefer element targets (`tap:text` / `tap:id`, see
  [semantic-layer.md](semantic-layer.md)) over pixel taps.
- Compose screens expose few elements; there, `shot` + `tap x y`.
- A view-only shared session rejects control — drive from the local server
  (see the [`share` skill](../../share/references/remote-tunnel.md)).
