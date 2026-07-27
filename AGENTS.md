# AGENTS.md — stream-droid

Guide for AI agents (and humans) working in this repo. `CLAUDE.md` is a symlink
to this file, so both are always identical. Read this before making changes.

## What this is

**stream-droid** streams a running Android **emulator or device** into the
browser and drives it (tap / swipe / type / keys), for humans and AI agents —
the Android analogue of [serve-sim](https://github.com/EvanBacon/serve-sim). A
React UI shows the live screen with a sidebar to list/boot AVDs; a bun server
bridges the browser to `adb` (and, for emulators, the emulator gRPC API).

It's a **sketch**, not production: no auth beyond the optional tunnel token, one
client per device assumed, localhost-first.

## Stack & tooling

- **Runtime:** [bun](https://bun.sh) ≥ 1.3.11 (pinned in `.bun-version`) **or
  node ≥ 20**. The server is TypeScript run directly — under bun natively, or
  under node via `tsx` (a dependency). `bin/stream-droid.mjs` is the published
  entry and picks the runtime (`typeof Bun`). **Fully bun-optional** — server,
  skill helpers, and the build all run under node or bun. The client bundle is
  built by `scripts/build-client.mjs` (esbuild; a small plugin wraps jmuxer's UMD
  so esbuild can extract its default export — see the script), CSS via
  `npx @tailwindcss/cli`. `ensureAssetsBuilt` builds both on first run under the
  current runtime; the npm package ships them prebuilt so running never builds.
- **Language:** TypeScript, `strict`, **no `any`** (enforced by oxlint).
- **Server deps:** `ws`, `@grpc/grpc-js` + `@grpc/proto-loader`, `ts-pattern`,
  `localtunnel`, `qrcode`.
- **Client:** React 19 + `react-dom`, **Tailwind v4** (`@tailwindcss/cli`),
  **tailwind-variants** (`tv`), `jmuxer` (H.264→MSE). Bundled by `bun build`.
- **Lint/format:** [OXC](https://oxc.rs) — `oxlint` (`.oxlintrc.json`) + `oxfmt`
  (`.oxfmtrc.json`). **Not** ESLint/Prettier.

## Commands

```bash
bun install
bun start            # build css+client, then run the server (opens browser)
bun run build        # build:css + build:client
bun run lint         # oxlint src
bun run format       # oxfmt src
bun run check        # oxlint + oxfmt --check + tsc --noEmit   ← CI gate
bun run typecheck    # tsc --noEmit
bun test             # unit tests (bun:test) in __tests__/ folders
```

**Always run `bun run check` before considering a change done.** It must exit 0
(lint clean, formatted, type-clean). Run `bun run format` to auto-fix style.

Run the server directly during dev: `bun run src/server.ts [name] [flags]`
(see `bun run src/server.ts -h`). Use `-d` / `--headless` in scripts/tests so it
doesn't pop a browser tab.

## Layout (where things live)

```
bin/stream-droid.mjs  published bin: launches the server under bun (native) or node (tsx)
src/
  server.ts        entry: match(config.mode) → help/list/kill/log/serve wiring only
  config.ts        parsed CLI/env → `config` singleton; isAuthorized(); fail()
  log.ts           leveled logger; quiet by default — only error() prints without -v/--verbose
  adb.ts           adbFor(serial), resolveSerial/targetSerial, deviceSize, sendPoster
  controllers.ts   Control/Incoming types; adb/scrcpy/grpc controllers; pickController
  httpServer.ts    static assets + /api/{state,start,stop,apps,launch,hierarchy} (ts-pattern routes)
  wsServer.ts      per-connection: stream frames out, route control in
  commands.ts      -h help · -a list · --kill · -l log · --tunnel
  lifecycle.ts     preflight, first-run asset build, boot target, openBrowser
  emulator.ts      list AVDs / running devices, boot (headless), tooling checks
  apps.ts          list packages / launch app / foreground app (adb; pure parsers)
  semantic.ts      uiautomator hierarchy dump + parse + findElement
  capture/
    types.ts       CaptureHandle / EmulatorInput / CaptureOptions contracts
    select.ts      startCapture() — pick backend from config
    screenrecord.ts / scrcpy.ts / grpc.ts   the three backends
    scrcpyControl.ts   scrcpy v4.1 control-message binary encoder
    scrcpyServer.ts    resolve/auto-download + SHA-256-verify the scrcpy jar
  grpc/            emulator_controller.proto, emulatorClient.ts, discovery.ts
  ui/              React app: App.tsx, hooks (useDeviceStream/useKeyboard),
                   api.ts, token.ts, types.ts, styles.css, components/*
  types/           ambient d.ts for untyped deps (jmuxer, localtunnel)
public/            index.html (shell) + built client.js / app.css (gitignored)
skills/            the `stream-droid` plugin — four agent skills (namespaced /stream-droid:<skill>)
  drive/           see & act loop; owns the shared scripts
    SKILL.md       the loop + quick reference
    scripts/       ensure-server.mjs (start/health) · drive.mjs (control) · check.mjs (prereqs) — plain ESM, bun OR node ≥ 18
    references/    cli, input-control, semantic-layer, browser-ui, agent-skill
  emulators/       list / boot (headless) / kill AVDs  (SKILL.md + references/)
  apps/            list / launch / foreground apps      (reuses drive's scripts)
  share/           public link + QR, view-only vs control
```

Skills reuse `drive`'s scripts via `$CLAUDE_PLUGIN_ROOT`, so they ship together.
Server protocol/pipeline internals stay in the code + `docs/`, not the skill
surface. Bump the version in all four `SKILL.md` + `.claude-plugin/*.json` on any
skill change.

## Conventions (follow these)

- **Config is a singleton.** All CLI/env parsing lives in `src/config.ts` and is
  read via `config.X`. Never re-parse `process.argv` elsewhere. Add a new flag
  there; if it takes a value, add it to `VALUE_FLAGS`.
- **Logging via `src/log.ts`, not `console.*`.** Use `log.info/warn/error` or a
  scoped `logger('scope')`. The logger is **quiet by default**: `info`, `warn`,
  and `debug` print only with `-v`/`--verbose` (which also timestamps); only
  `error` always prints. Put per-frame/control detail in `.debug()`, and
  gate raw child-process output on `config.VERBOSE`. Don't log the server's own
  HTTP access lines — the client polls `/api/state` every 3 s, so per-request logs
  just flood the terminal even under `-v`. Standalone command output
  (`-h`/`-a`/`-l`/`--kill`/tunnel QR) uses `console.*` directly so it always shows.
- **`ts-pattern` for dispatch & discriminated unions.** Use `match(...).with(...)
  .exhaustive()` for command dispatch, the control-message switch in each
  controller, capture selection, and platform branching — not `switch`/if-chains.
  It's used in the client too (e.g. `Screen.tsx` renders per `ConnState`); the
  ~6 KB it adds to the bundle is an accepted trade for exhaustive, readable
  state rendering.
- **All classNames go through `tailwind-variants` (`tv`)** — `tv({ base })`,
  `tv({ slots })`, or `tv({ variants })`. There is no `cn` helper; don't add one.
- **React:** function components + hooks only. Imperative stream/WS/jMuxer logic
  lives in `useDeviceStream`; components stay declarative. Import React types by
  name (`import { useRef, type RefObject } from 'react'`) — do **not** use the
  `React.X` global namespace (breaks under `verbatimModuleSyntax`). Client is
  built by `scripts/build-client.mjs` (esbuild, under node or bun; a plugin wraps
  jmuxer's UMD so its default export resolves) — set `NODE_ENV=production` via
  `define`, as that script does.
- **Imports use explicit `.ts`/`.tsx` extensions** (bundler resolution).
- **Types for untyped deps** go in `src/types/*.d.ts` (module declarations).
- **No `any`.** Type dynamic gRPC/proto surfaces with narrow interfaces (see
  `grpc/emulatorClient.ts`).
- **Hoist helpers that don't capture locals** (oxlint `consistent-function-scoping`).
- Style: single quotes, semicolons, 2-space, ~110 col, trailing commas (oxfmt).

## Architecture notes / gotchas (don't regress these)

- **Capture backends** (`--capture`): `screenrecord` (default, any device, H.264),
  `scrcpy` (uses the **v4.1** jar — older versions crash on Android 14+; uses
  `raw_stream=true`, H.264; the jar is auto-downloaded + SHA-256-verified into
  `~/.cache/stream-droid` by `scrcpyServer.ts` if `--scrcpy-server` isn't given),
  `grpc` (**emulator-only**, PNG frames via
  `streamScreenshot`, no jar/adb for capture). Codec is `h264` for the first two,
  `png` for gRPC; the client renders `<video>` (jMuxer) vs `<canvas>` accordingly.
- **Input paths** (auto-picked in `pickController`): gRPC RPCs > scrcpy control
  socket > `adb input`. scrcpy opens a **second** socket for control and blocks
  video until it connects — that's why `scrcpy.ts` opens control on video
  *establish*, not on first data (deadlock otherwise).
- **Instant preview (poster).** H.264/MSE is slow & flaky to start from an idle
  screen's single frame (seconds, or never). On connect the server sends one
  `screencap` PNG (h264 modes) and the client sets it as the `<video>`'s
  **`poster`** attribute. Do **not** "fix" this by hiding the video to show a
  canvas — a `display:none` video won't autoplay and playback stalls forever.
- **Tunnel security.** `--tunnel` is **view-only** by default; control is gated
  by a random token (`config.CONTROL_TOKEN`). Local browser gets `?k=<token>`;
  `--tunnel-control` bakes it into the shared link. WS drops control when
  unauthorized; `/api/start` returns 403. localtunnel is a public relay — treat
  as untrusted.
- **Semantic layer.** `/api/hierarchy` = `uiautomator dump` parsed (decode XML
  entities!). `{type:'tapElement', id|text}` resolves an element center → normal
  tap, so it works across all input backends.
- **gRPC discovery/auth.** The emulator advertises `pid_*.ini`
  (`grpc.port` + `grpc.token`); we send `authorization: Bearer <token>`. Coords
  are device pixels; keys are W3C DOM names (`GoHome`/`GoBack`/`AppSwitch`).
- **Serial vs AVD name.** `--serial`/positional accept either; `resolveSerial`
  and `targetSerial` map by adb serial **or** AVD name (case-insensitive).

## How to extend

- **New CLI flag:** add to `config.ts` (and `VALUE_FLAGS` if it takes a value);
  document in `commands.ts` `printHelp()` and the README flags table.
- **New capture backend:** implement `CaptureHandle` in `src/capture/xxx.ts`,
  add a branch in `capture/select.ts`, and set its codec expectation.
- **New control message:** extend `Control` in `controllers.ts`, handle it in all
  three controllers (exhaustive `match`), and in the client `send`/`Screen`.
- **New API route:** add to `httpServer.ts` (route on `path`, read `?k=` off
  `url` for auth via `isAuthorized`).
- **New React component:** `src/ui/components/`, classNames via `tv`.

## Verifying changes

Unit tests run with **`bun test`** (`bun:test`); they live in `__tests__/` folders
next to the code (e.g. `src/capture/__tests__/`) and are excluded from the npm
tarball. Coverage is light and focused on pure/verifiable logic (e.g. the scrcpy
jar download + checksum resolver) — add tests there when you touch that kind of
code. Most behaviour still needs a **real emulator**:

- Start it headless: `bun run src/server.ts -d` (add `CAPTURE=grpc` etc).
- Stream/control check: connect a WS client to
  `ws://localhost:3200/?serial=emulator-5554`, count binary frames, send a
  `{type:'tap'|'key'...}`, and confirm device state via
  `adb -s <serial> shell dumpsys window | grep mCurrentFocus`.
- UI/responsive/render: drive a browser (e.g. Playwright) — check the LIVE
  indicator, the mobile drawer, and time-to-first-frame.
- Then `bun run check`.

## Housekeeping

- **Don't commit** build artifacts (`public/client.js`, `public/app.css`) or the
  `scrcpy-server-*` jar — all gitignored.
- macOS `sed` is BSD (no `\b`); prefer the editing tools over shell `sed`.
- Keep the README in sync when you change flags, commands, or layout.
