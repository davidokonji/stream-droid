# HTTP API

Served on the same port as the WebSocket (default `3200`). JSON in/out. Routes
are matched on the path; auth reads `?k=` off the URL (see
[remote-tunnel.md](remote-tunnel.md) — only enforced in tunnel mode).

## `GET /api/state`

Everything the sidebar needs.

```jsonc
{
  "avds": [ { "name": "Pixel_9", "running": true, "serial": "emulator-5554" } ],
  "devices": [ { "serial": "emulator-5554", "avd": "Pixel_9" } ],
  "capture": "screenrecord",   // the server's --capture mode
  "target": "Pixel_9"          // the pinned CLI target ("" if none)
}
```

```bash
curl -s localhost:3200/api/state | jq
```

## `POST /api/start`

Boot an AVD (see [emulators.md](emulators.md)). Body `{ avd, headless? }`.

```bash
curl -sX POST localhost:3200/api/start \
  -H 'content-type: application/json' -d '{"avd":"Pixel_9","headless":true}'
# → { "ok": true, "avd": "Pixel_9", "pid": 12345 }
```

| Status | When |
|---|---|
| 200 | booting — `{ ok:true, avd, pid }` |
| 400 | `{ ok:false, error:"avd required" }` |
| 403 | `{ ok:false, error:"view-only session" }` (tunnel, no token) |
| 500 | `{ ok:false, error:"<msg>" }` (e.g. unknown AVD, no emulator binary) |

Add `?k=<token>` when the server is in tunnel mode.

## `GET /api/apps?serial=<serial>&all=<0|1>`

Installed packages and the current foreground app. `serial` optional (resolved
device); `all=1` includes system packages (default: third-party only).

```bash
curl -s "localhost:3200/api/apps?serial=emulator-5554" | jq '{foreground, n: (.packages|length)}'
```

Returns `{ serial, foreground, packages:[…] }` (`foreground` may be `null` if it
can't be determined), or 400 `{ ok:false, error:"no running device" }`.

## `POST /api/launch?serial=<serial>`

Launch an app by package (its launcher activity is resolved via `monkey`).
Control-gated like `/api/start`. Body `{ package }`.

```bash
curl -sX POST "localhost:3200/api/launch?serial=emulator-5554" \
  -H 'content-type: application/json' -d '{"package":"com.android.settings"}'
# → { "ok": true, "package": "com.android.settings" }
```

| Status | When |
|---|---|
| 200 | `{ ok:true, package }` |
| 400 | `{ ok:false, error:"package required" }` / `"no running device"` |
| 403 | `{ ok:false, error:"view-only session" }` (tunnel, no token) |
| 500 | `{ ok:false, error:"<msg>" }` |

## `GET /api/hierarchy?serial=<serial>`

The current window's UI tree — see [semantic-layer.md](semantic-layer.md).
`serial` optional; omitted → resolved device.

```bash
curl -s "localhost:3200/api/hierarchy?serial=emulator-5554" | jq '.count'
```

Returns `{ serial, count, nodes:[…] }`, or 400 `{ ok:false, error:"no running device" }`.

## Static

`GET /` → `index.html`; `GET /client.js`, `GET /app.css` → the built bundle.
Anything else → 404.
