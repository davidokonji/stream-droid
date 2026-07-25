# Input & control

Drive the device by sending **control messages** over the [WebSocket](websocket.md).
Clients speak **normalized `[0..1]`** coordinates; the server scales to device
pixels, so input is resolution-independent.

## Control messages (client → server, JSON)

| Message | Meaning |
|---|---|
| `{ "type": "tap", "x": 0.5, "y": 0.5 }` | tap at a normalized point |
| `{ "type": "swipe", "x1": .5, "y1": .8, "x2": .5, "y2": .2, "ms": 200 }` | swipe (`ms` optional, default 200) |
| `{ "type": "text", "value": "hello" }` | type a string into the focused field |
| `{ "type": "key", "key": "Home" }` | press a named key (below) |
| `{ "type": "tapElement", "id": "…" \| "text": "…" }` | tap an element — see [semantic-layer.md](semantic-layer.md) |

Key names: `Enter`, `Backspace`, `Tab`, `ArrowUp`, `ArrowDown`, `ArrowLeft`,
`ArrowRight`, `Home`, `Back`, `AppSwitch`.

Example (bun):

```ts
const ws = new WebSocket('ws://localhost:3200/?serial=emulator-5554');
ws.onopen = () => ws.send(JSON.stringify({ type: 'tap', x: 0.5, y: 0.5 }));
```

Or use the agent helper: `bun skills/stream-droid/scripts/drive.mjs tap 0.5 0.5`
(see [agent-skill.md](agent-skill.md)).

## Input paths (chosen automatically)

The server picks one per connection (`pickController`), preferring lower latency:

1. **emulator gRPC** (`--capture grpc`) — `sendTouch`/`sendKey` RPCs. Coordinates
   are device pixels; nav keys use W3C DOM names (`GoHome`/`GoBack`/`AppSwitch`).
2. **scrcpy control socket** (scrcpy mode, control on) — binary control messages
   on a second socket; no per-event process spawn. Disable with
   `--scrcpy-control off`.
3. **`adb input`** — screenrecord mode, or scrcpy with control off. Universal,
   spawns an `adb` per event.

The mapping from the control messages above to each path is identical from the
client's view — only latency and the transport differ. Swipes on the scrcpy/gRPC
paths are synthesized as a DOWN → MOVEs → UP sequence over `ms`.

## Notes

- Normalized coords mean the same message works at any resolution/rotation.
- `text` on the `adb input` path escapes spaces as `%s` and is fussy with
  punctuation — for heavy typing, an ADB IME (e.g. ADBKeyBoard) is more reliable.
- Control is rejected on a **view-only** tunnel connection (no token) — see
  [remote-tunnel.md](remote-tunnel.md).
