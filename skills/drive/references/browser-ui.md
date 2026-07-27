# Browser UI

Open the server URL (default http://localhost:3200). React + Tailwind; dark theme.

## Layout

- **Sidebar (Emulators)** — every AVD: 🟢 running · 🟡 booting · ⚪ stopped,
  ordered **most-recently-active first** (running ones on top, then stopped by
  last-run recency).
  - **Start** on a stopped AVD boots it (tick **headless** first for no host
    window). **Stream** on a running one connects to it.
  - After **Start**, the row shows a spinner + **booting…** until the emulator
    comes online (~20-60 s) — it doesn't silently revert to Start.
  - The streaming row shows **● LIVE** with a **Close/Stop** button. If the
    emulator is running **headless** (no window), it reads **Close** and shuts it
    down entirely (`adb emu kill`) — there's no window to fall back to. Whether
    it's headless is detected server-side from the emulator's process (`-no-window`),
    so it's correct even if you didn't boot it from this browser or the server
    restarted. A windowed emulator reads **Stop** and just detaches the stream; it
    keeps running and can be re-streamed. (Re-selecting the already-live device is
    a no-op — it doesn't restart the capture.)
  - While any AVD is booting, the **other** controls are disabled to prevent
    conflicts — every other **Start**, the **Stream** action on running rows, and
    the **headless** toggle go non-interactive (dimmed, `not-allowed` cursor) and
    re-enable automatically once the boot resolves. An already-live stream is left
    untouched.
  - The streaming row shows a pulsing **● LIVE** badge instead of Stream.
  - Polls `/api/state` every 3 s to reflect boot/shutdown.
- **Main** — the live device with nav buttons (◀ Back · ● Home · ■ Recents) and a
  status line (`serial · WxH · codec`, + view-only when applicable). The nav bar,
  the `click = tap · drag = swipe · type = keys` hint, and the status line show
  **only while a device is live**.
  - **When nothing is streaming**, a device-shaped empty state replaces the
    preview: it offers a one-click **▶ Start <name>** for your most-recent
    emulator (or guidance to install the SDK emulator if none exist), reflects an
    in-progress boot, and points to the sidebar for the rest.

## Driving

On the device surface:

- **Click** = tap · **drag** = swipe · **type** = keys (printable chars are sent
  as text; Enter/Backspace/Tab/arrows as keys).
- Coordinates are normalized, so it works at any size.

## Indicators

- **● LIVE** — shown in the sidebar row, over the video, and in the status when
  frames are flowing. Only one device streams at a time.
- **👁 view-only** — shown when connected over a view-only tunnel; input is
  disabled (see the [`share` skill](../../share/references/remote-tunnel.md)).
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
