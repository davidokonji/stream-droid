# How it works — architecture & design notes

```
                          ┌── screenrecord ─┐
browser ──WS(control)──▶ server.ts ──▶ scrcpy v4.1 ─┼─▶ H.264 ─▶ jMuxer → <video>
   ▲                        │          └── emulator gRPC ┘   PNG  ─▶ <canvas>
   └──────── WS(frames) ────┘
                            input: adb input · scrcpy control socket · emulator gRPC
```

A **bun** server bridges the browser to a device. It exposes static assets and a
small HTTP API, and a WebSocket per connection that streams capture frames out and
routes control messages in. A chosen **capture backend** produces the video
(H.264) or PNG frames; the React client renders `<video>` (via jMuxer/MSE) or
`<canvas>` accordingly. Input is injected through whichever path fits the backend.

- **Capture** — three interchangeable backends, see
  [capture-backends.md](capture-backends.md).
- **Control** — three input paths + element-level semantic control, see
  [control-and-semantics.md](control-and-semantics.md).
- **Contributor's map** of every source file lives in
  [AGENTS.md](../AGENTS.md).

## Design notes / knobs

- **Instant preview (poster).** An H.264/MSE stream is slow-and-flaky to start
  from an idle screen's trickle of frames (it can take several seconds, or stall).
  So on connect the server sends one `screencap` PNG, set as the `<video>`'s
  `poster` — the current screen shows in ~300 ms and the browser swaps to live
  video on the first decoded frame. (Hiding the video to show the shot instead
  would block autoplay; the poster keeps it visible so it still plays.) gRPC/PNG
  is already instant, so it skips the poster.
- **Headless boot** = `emulator -avd NAME -no-window -no-audio` — fully
  adb/stream-capable with no GUI on the host. Boot still takes ~20–60 s before
  `adb` sees it; the sidebar polls `/api/state` every 3 s and updates 🟢/⚪.
- **One capture pipe per client.** Simple on purpose. For many viewers, capture
  once and fan the H.264 chunks out to all sockets.
- **Normalized coordinates** keep taps correct across resolutions and rotation —
  see [control-and-semantics.md](control-and-semantics.md).

## The live UI

The browser shows the live screen with a **● LIVE** indicator for the device
currently streaming (one at a time), a sidebar to list/boot AVDs, and a
click-to-tap / drag-to-swipe / type-to-key video pane. It's responsive — on a
phone the sidebar collapses into a ☰ drawer. Full walkthrough:
[browser-ui.md](../skills/stream-droid/references/browser-ui.md).
