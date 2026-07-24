# Control: input paths & semantic (element) control

How taps, swipes, typing, and key presses reach the device — and how to target UI
**elements** instead of raw pixels.

## Input paths

The server picks the injection path automatically per capture backend:

- **emulator gRPC** (`--capture grpc`) — `sendTouch` / `sendKey` RPCs. Coordinates
  are device pixels; nav keys use W3C DOM names (`GoHome`, `GoBack`, `AppSwitch`).
- **scrcpy control socket** (scrcpy mode) — control messages encoded to scrcpy's
  v4.1 binary protocol and written straight to its control socket (no per-event
  process spawn), so latency is low. Taps, swipes (synthesized DOWN→MOVE→UP),
  text, and nav keys. Disable with `--scrcpy-control off`.
- **`adb input`** — screenrecord mode, or scrcpy with control off. Universal but
  spawns an `adb` process per event.

> The scrcpy backend opens a **second** connection to the forwarded port for the
> control socket. scrcpy accepts video first, then control, and blocks video
> until the control socket connects — so stream-droid opens control as soon as the
> video socket is established (see `src/capture/scrcpy.ts`).

**Normalized coordinates.** The browser sends `[0..1]` positions; the server
scales them to device pixels from `adb shell wm size` per device, so taps stay
correct across resolutions and rotation (and the scrcpy backend needs no size
header).

**Typing caveat.** `adb input text` escapes spaces as `%s` and is fussy with
punctuation; swap in an ADB IME (e.g. ADBKeyBoard) for reliable full-text entry.

## Semantic control (elements, not pixels)

All three backends are pixel-based; for agents that need to target UI *elements*
and read on-screen state, stream-droid exposes the accessibility/view hierarchy
over plain adb — `uiautomator dump`, no Appium server required. Works on
emulators and physical devices (`src/semantic.ts`).

- **`GET /api/hierarchy?serial=…`** → JSON of every node: `resourceId`, `text`,
  `desc`, `className`, `clickable`, `bounds`, and `center`.
- **`{ "type": "tapElement", "id": "…" | "text": "…" }`** over the WebSocket —
  the server resolves the first matching element's center and taps it via the
  active input backend. `id` matches the full resource-id or its short tail;
  `text` matches exactly or as a substring (of text or content-desc).

This is robust against resolution/layout changes where fixed coordinates would
break. For richer driver semantics (smart waits, complex gestures, cross-platform
scripts), [Appium](https://appium.io/) / UiAutomator2 remains the heavier option.

## Programmatic API

The HTTP routes (`/api/state`, `/api/start`, `/api/hierarchy`) and the WebSocket
frame + control protocol are documented, agent-focused, in the skill references:
[http-api.md](../skills/stream-droid/references/http-api.md) and
[websocket.md](../skills/stream-droid/references/websocket.md).
