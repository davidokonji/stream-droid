# Input & control

Drive the device with the `drive.mjs` helper. Coordinates are **normalized
`[0..1]`** — the server scales them to device pixels, so the same command works at
any resolution or rotation. Prefer element targets (see
[semantic-layer.md](semantic-layer.md)) over pixels when you can.

## Commands

```bash
drive tap 0.5 0.5             # tap a normalized point
drive longpress 0.5 0.5 800   # press and hold (ms optional, default 500)
drive swipe 0.5 0.8 0.5 0.2   # swipe — this one scrolls up
drive scroll 0.5 0.5 0.5      # scroll at a point by dy (dx optional)
drive text "hello world"      # type into the focused field
drive key Home                # press a named key (below)
drive tap:text "Network & internet"   # tap by element text/desc
drive tap:id search                    # tap by resource-id
```

Installed as a plugin, `drive` is on your PATH (as above); from a clone, run
`node skills/drive/scripts/drive.mjs …`.

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
- **Clipboard** — the browser UI supports `⌘V` / `Ctrl+V` to paste and `⌘C` / `Ctrl+C` to copy (copy requires `--capture scrcpy`). The `drive.mjs` helper has no clipboard command — clipboard is a browser-UI-only feature.
- **View-only sessions** reject control — if the session was shared view-only (see
  the [`share` skill](../../share/references/remote-tunnel.md)), drive from the
  local server instead.

The helper wraps the server, which picks the fastest available input path for the
device automatically — you don't choose it. Those internals (gRPC / scrcpy control
socket / `adb input`) live in the source and `AGENTS.md`, not here.
