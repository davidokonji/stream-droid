# Agent skill (scripts/drive.mjs)

Drive a device from an AI agent (or any script) via a running server. The skill
lives one level up: [`../SKILL.md`](../SKILL.md); the helpers are in
[`../scripts/`](../scripts/) — `drive.mjs` (control) and `check.mjs` (prerequisites).

## Setup

```bash
bun run src/server.ts -d               # server, headless (no browser)
bun scripts/check.mjs                   # verify bun, adb, a device, the server
```

`drive.mjs` talks to `localhost:3200` (override with `--port` /
`$STREAM_DROID_PORT`). Pick a device with `--serial <serial|avd>` /
`$STREAM_DROID_SERIAL`, else the first running one is used.

## Commands

Run from the skill dir (`bun scripts/drive.mjs …`) or the repo root
(`bun skills/stream-droid/scripts/drive.mjs …`):

| Command | Does |
|---|---|
| `devices` | list running devices |
| `shot [file]` | save a screenshot PNG (default `screen.png`) |
| `ui [grep]` | list UI elements (`•` = clickable); optional text filter |
| `tap:text "<text>"` | tap the element whose text/desc contains `<text>` |
| `tap:id <resource-id>` | tap by resource-id (full or tail after `/`) |
| `tap <x> <y>` | tap normalized `[0..1]` coords |
| `swipe <x1> <y1> <x2> <y2>` | swipe (normalized) — e.g. `0.5 0.8 0.5 0.2` scrolls up |
| `text "<string>"` | type into the focused field |
| `key <Name>` | `Enter`\|`Backspace`\|`Tab`\|`Home`\|`Back`\|`AppSwitch`\|`Arrow{Up,Down,Left,Right}` |

## The loop

```bash
bun scripts/drive.mjs shot                          # look → open screen.png
bun scripts/drive.mjs ui internet                   # read → elements matching "internet"
bun scripts/drive.mjs tap:text "Network & internet" # act
bun scripts/drive.mjs shot                          # confirm the screen changed
```

## What it maps to

`drive.mjs` is a thin wrapper over the documented APIs:
`devices`/`ui` → [HTTP](http-api.md) (`/api/state`, `/api/hierarchy`);
`tap*`/`swipe`/`text`/`key` → [WebSocket](websocket.md) control messages;
`shot` → `adb exec-out screencap -p`. Prefer `tap:text`/`tap:id` (element-based,
see [semantic-layer.md](semantic-layer.md)) over pixel taps.

## Notes

- Always screenshot before/after — don't assume an action landed.
- Compose screens expose few elements; there, `shot` + `tap x y`
  ([semantic-layer.md](semantic-layer.md)).
- A view-only tunnel rejects control — run the server locally to drive
  ([remote-tunnel.md](remote-tunnel.md)).
