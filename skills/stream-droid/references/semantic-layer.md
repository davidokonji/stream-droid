# Semantic layer (elements, not pixels)

Target UI **elements** by resource-id or text instead of pixels — robust against
resolution/layout changes. Built on `adb`'s `uiautomator dump` (no Appium).
Works on emulators and physical devices.

## Read the hierarchy

`GET /api/hierarchy?serial=<serial>` → JSON of every node:

```json
{
  "serial": "emulator-5554",
  "count": 73,
  "nodes": [
    {
      "resourceId": "com.android.settings:id/search",
      "text": "Network & internet",
      "desc": "",
      "className": "android.widget.TextView",
      "clickable": true,
      "bounds": [0, 210, 1080, 320],
      "center": [540, 265]
    }
  ]
}
```

- `bounds` = `[left, top, right, bottom]` in device pixels; `center` = `[x, y]`.
- XML entities are decoded, so `text` is `"Network & internet"`, not `&amp;`.

## Tap an element

Send over the [WebSocket](websocket.md):

```json
{ "type": "tapElement", "id": "search" }
{ "type": "tapElement", "text": "Network & internet" }
```

The server resolves the first matching node's `center` and taps it via the active
[input path](input-control.md) — so it works across all backends.

**Matching rules:**
- `id` matches the full `resourceId` **or** its short tail (after `/`), so `search`
  matches `com.android.settings:id/search`.
- `text` matches the node's `text` **or** `content-desc`, exactly or as a
  **substring**.
- If both are given, both must match; the first hit wins.

With the helper: `bun scripts/drive.mjs ui [grep]` lists elements;
`bun scripts/drive.mjs tap:text "…"` / `tap:id "…"` taps one.

## Limitation

Jetpack **Compose** screens (e.g. modern Settings' `SpaActivity`) expose little
to `uiautomator`, so the hierarchy may be sparse and `tapElement`/`ui` come up
empty. There, fall back to a screenshot and a normalized `tap x y`.
