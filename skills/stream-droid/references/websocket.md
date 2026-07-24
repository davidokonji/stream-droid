# WebSocket protocol

One WebSocket on the server port carries **frames out** (video) and **control
in**. This is what the browser and the [agent helper](agent-skill.md) use.

## Connect

```
ws://<host>:<port>/?serial=<serial>[&k=<token>]
```

- `serial` — device to stream (serial or AVD name); omitted → resolved device.
- `k` — control token, only needed in tunnel mode (see [remote-tunnel.md](remote-tunnel.md)).

Opening a connection starts a capture pipe for that device.

## Server → client

**JSON messages:**

| Message | Meaning |
|---|---|
| `{ "type":"meta", "name", "w", "h", "codec":"h264"\|"png", "control":true }` | sent first: device size, wire codec, and whether this session may drive (`control:false` = view-only) |
| `{ "type":"poster" }` | the **next binary message** is a one-shot PNG preview |
| `{ "type":"error", "message" }` | e.g. no device; the connection then closes |

**Binary messages:** stream frames. Interpret by the `codec` from `meta`:
- `h264` — an H.264 Annex-B byte stream (feed to jMuxer/MSE).
- `png` — complete PNG images (draw to a canvas).
- The poster (always PNG) arrives once, right after its JSON marker.

## Client → server

JSON control messages — full list and coordinate rules in
[input-control.md](input-control.md):

```json
{ "type": "tap", "x": 0.5, "y": 0.5 }
{ "type": "swipe", "x1": .5, "y1": .8, "x2": .5, "y2": .2, "ms": 200 }
{ "type": "text", "value": "hello" }
{ "type": "key", "key": "Home" }
{ "type": "tapElement", "id": "search" }
```

Coordinates are normalized `[0..1]`. Messages from a **view-only** connection
(tunnel, no token) are ignored.

## Minimal client

```ts
const ws = new WebSocket('ws://localhost:3200/?serial=emulator-5554');
ws.binaryType = 'arraybuffer';
let codec = 'h264';
ws.onmessage = (e) => {
  if (typeof e.data === 'string') {
    const m = JSON.parse(e.data);
    if (m.type === 'meta') codec = m.codec;
    // handle 'poster' / 'error' as needed
  } else {
    // binary frame — decode per `codec`
  }
};
ws.onopen = () => ws.send(JSON.stringify({ type: 'tap', x: 0.5, y: 0.5 }));
```
