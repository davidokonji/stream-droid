# Input & control

Drive the device with the `drive.mjs` helper. Coordinates are **normalized
`[0..1]`** — the server scales them to device pixels, so the same command works at
any resolution or rotation. Prefer element targets (see
[semantic-layer.md](semantic-layer.md)) over pixels when you can.

## Commands

```bash
node scripts/drive.mjs tap 0.5 0.5             # tap a normalized point
node scripts/drive.mjs longpress 0.5 0.5 800   # press and hold (ms optional, default 500)
node scripts/drive.mjs swipe 0.5 0.8 0.5 0.2   # swipe — this one scrolls up
node scripts/drive.mjs scroll 0.5 0.5 0.5      # scroll at a point by dy (dx optional)
node scripts/drive.mjs text "hello world"      # type into the focused field
node scripts/drive.mjs key Home                # press a named key (below)
node scripts/drive.mjs tap:text "Network & internet"   # tap by element text/desc
node scripts/drive.mjs tap:id search                    # tap by resource-id
```

From a clone the path is `node skills/drive/scripts/drive.mjs …`; installed as a
plugin, `node "$CLAUDE_PLUGIN_ROOT/skills/drive/scripts/drive.mjs" …`.

## Key names

`Enter` `Backspace` `Tab` `Home` `Back` `AppSwitch` `Escape` `Delete`
`Arrow{Up,Down,Left,Right}` `Page{Up,Down}` `DpadCenter` `Menu` `Search`
`Notifications` `Power` `Camera` `Volume{Up,Down,Mute}`
`Media{PlayPause,Next,Previous}`.

## Notes

- **Normalized coords** mean one command works across resolutions/rotation. `swipe`
  runs `x1 y1 → x2 y2`; content moves the way you drag, so drag *up* to scroll down
  a page and vice-versa.
- **Typing punctuation** can be fussy depending on the device's input method; for
  heavy or special-character input, an ADB IME (e.g. ADBKeyBoard) is more reliable.
- **View-only sessions** reject control — if the session was shared view-only (see
  the [`share` skill](../../share/references/remote-tunnel.md)), drive from the
  local server instead.

The helper wraps the server, which picks the fastest available input path for the
device automatically — you don't choose it. Those internals (gRPC / scrcpy control
socket / `adb input`) live in the source and `AGENTS.md`, not here.
