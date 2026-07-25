# Browser UI

Open the server URL (default http://localhost:3200). React + Tailwind; dark theme.

## Layout

- **Sidebar (Emulators)** — every AVD: 🟢 running · 🟡 booting · ⚪ stopped.
  - **Start** on a stopped AVD boots it (tick **headless** first for no host
    window). **Stream** on a running one connects to it.
  - After **Start**, the row shows a spinner + **booting…** until the emulator
    comes online (~20-60 s) — it doesn't silently revert to Start.
  - While any AVD is booting, the **other** controls are disabled to prevent
    conflicts — every other **Start**, the **Stream** action on running rows, and
    the **headless** toggle go non-interactive (dimmed, `not-allowed` cursor) and
    re-enable automatically once the boot resolves. An already-live stream is left
    untouched.
  - The streaming row shows a pulsing **● LIVE** badge instead of Stream.
  - Polls `/api/state` every 3 s to reflect boot/shutdown.
- **Main** — the live device, nav buttons (◀ Back · ● Home · ■ Recents), and a
  status line: `serial · WxH · codec` (+ view-only when applicable).

## Driving

On the device surface:

- **Click** = tap · **drag** = swipe · **type** = keys (printable chars are sent
  as text; Enter/Backspace/Tab/arrows as keys).
- Coordinates are normalized, so it works at any size.

## Indicators

- **● LIVE** — shown in the sidebar row, over the video, and in the status when
  frames are flowing. Only one device streams at a time.
- **👁 view-only** — shown when connected over a view-only tunnel; input is
  disabled (see [remote-tunnel.md](remote-tunnel.md)).
- **Preview overlay** — when frames aren't flowing, the preview shows a state
  instead of a frozen/blank frame: a spinner while **connecting**, and
  **device disconnected** (amber) when the stream drops, over the last frame.
- **Browser-tab title** — reflects what's streaming: `● Pixel_9 · stream-droid`
  when live (the AVD name if known, else the serial), `⚠ …` when disconnected,
  and just `stream-droid` when idle.

## Instant preview (poster)

On connect the server sends one screenshot; in H.264 mode it's set as the
`<video>`'s `poster`, so the current screen appears in ~300 ms and the browser
swaps to live video on the first decoded frame. (Otherwise MSE can take seconds
to start from an idle screen — or stall.) gRPC/PNG renders on a `<canvas>` and is
already instant.

## Responsive

- **Desktop:** sidebar is a fixed 240 px column.
- **Mobile:** the sidebar collapses into a ☰ drawer (top bar shows the current
  device + LIVE); the drawer slides in over a dimmed backdrop with a ✕ to close.
  The video fits the screen width.
