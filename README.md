# stream-droid

**Stream a running Android emulator or device to your browser and drive it —
tap, swipe, type, hardware keys — for humans and AI agents.**

[![CI](https://github.com/davidokonji/stream-droid/actions/workflows/ci.yml/badge.svg)](https://github.com/davidokonji/stream-droid/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/stream-droid)](https://www.npmjs.com/package/stream-droid)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![docs](https://img.shields.io/badge/docs-online-blue)](https://davidokonji.github.io/stream-droid/)
[![agents](https://img.shields.io/badge/agent%20skill-install-8A2BE2)](#install-the-skill)

![stream-droid — one command opens a live Android device in your browser; tap/swipe/type or let an agent drive; boot headless, share a link, works with emulators and real phones](docs/demo.gif)

Point stream-droid at a running emulator or phone and it serves a live view of
the screen in the browser that you can click, drag, and type into. A sidebar
lists and boots AVDs (optionally headless), and everything is scriptable over a
small HTTP/WebSocket API — so an AI agent can *see* and *act on* an Android app
the same way a person does.

It's the Android analogue of Evan Bacon's
[serve-sim](https://github.com/EvanBacon/serve-sim): where serve-sim needed a
Swift framebuffer helper for the iOS simulator, Android already exposes
everything through `adb` (and, for emulators, a gRPC API). The server is
TypeScript on [bun](https://bun.sh); the browser UI is React + Tailwind.

## Features

- **Live screen streaming** of any Android emulator or physical device to the browser.
- **Full input** — click = tap, drag = swipe, keyboard = type, buttons for Back / Home / Recents.
- **Three capture backends** — `screenrecord` (default, zero setup), `scrcpy`
  (high FPS; jar auto-downloads), and emulator `grpc` (PNG, no adb for capture).
  See [capture backends](docs/capture-backends.md).
- **Semantic control** — target UI *elements* by resource-id or text via
  `uiautomator`, no Appium server. Survives layout/resolution changes.
  See [control & semantics](docs/control-and-semantics.md).
- **Emulator management** — a devices rail of per-device cards lists running /
  stopped AVDs and boots them, with visible **Headless** / **Cold boot** toggles on
  each card (no host window = headless; adb/stream only).
- **Remote sharing** — open a public link + QR straight from the in-app **Share**
  button (**view-only** or **with control**), or via `--tunnel` /
  `--tunnel-control`. See [remote sharing](docs/remote-sharing.md).
- **Instant preview** (poster frame), a **● LIVE** indicator, and a **responsive
  UI** that collapses to a ☰ drawer on mobile.
- **Agent-ready** — an installable [agent skill](#agent-usage) plus HTTP/WebSocket
  APIs for AI-driven automation.
- **One-command CLI** — stream by name, list streams, kill an emulator, tail
  logcat, or open a tunnel.

## Why stream-droid

Watching and driving an Android screen usually means either the full Android
Studio GUI (heavy, human-only) or Appium/UiAutomator2 (a driver stack aimed at
scripted tests). stream-droid fills the gap serve-sim opened for iOS: a
lightweight, one-command way to **put a live, interactive device in a browser
tab** — to demo, debug, pair on, or hand to an AI agent.

- **For humans** — see the device, click around, share a link so someone remote
  can watch or take over.
- **For agents** — a stable loop of *screenshot → read elements → act*, with
  element-level targeting that doesn't break when the layout shifts, over plain
  `adb` with no extra driver server.

## Setup

You need **[bun](https://bun.sh) or [node](https://nodejs.org) ≥ 20**, **adb** on
`PATH`, and a running device or emulator. The SDK `emulator` (to list/boot AVDs)
is optional, and the scrcpy jar auto-downloads if you use that backend. The server
runs a **preflight check** on startup and exits with a specific fix if something's
missing.

→ Full prerequisite matrix, physical-device notes, troubleshooting, and the
security posture: **[docs/setup.md](docs/setup.md)**.

```bash
bunx stream-droid                 # run the published package (no clone/build)
npx stream-droid                  # …or with node — bun not required

# …or from a clone (building the client uses bun):
bun install
bun start                         # builds the client, serves http://localhost:3200
```

`bun start` builds the CSS + client bundle, then runs the server and **auto-opens
your browser** at http://localhost:3200.

> **Runs under bun _or_ node.** The `bin` (`bin/stream-droid.mjs`) launches the
> TypeScript server natively under bun, or under node via [tsx](https://tsx.is) —
> so `bunx stream-droid` and `npx stream-droid` both work and **bun isn't required
> to run the published tool**. Building the client from a clone still uses bun.

## CLI commands & examples

Pass a positional **emulator name** to stream (and boot, if stopped) that device
by default.

| Command | Meaning |
|---|---|
| `stream-droid <name>` | stream that emulator/AVD by default (boots it if stopped) |
| `-h` / `--help` | print usage and exit |
| `-a` / `--list` | list running streams (+ stopped AVDs), then exit |
| `-l` / `--log` / `--logcat` | stream the device's logcat, colourised by level (no server) |
| `--kill [name]` | shut down a running emulator (emulators only), then exit |
| `-t` / `--tunnel` | expose the server via a public link + QR (**view-only**) |
| `-tc` / `--tunnel-control` | tunnel, but the shared link can also **control** |

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--port` | `PORT` | `3200` | HTTP + WS port (if busy, prompts to use the next free port; auto when headless / non-interactive) |
| `-d` / `--headless` | `STREAM_DROID_HEADLESS=1` | off | **don't** auto-open the browser (server still runs) |
| `-v` / `--verbose` | `STREAM_DROID_VERBOSE=1` | off | show logs — quiet by default (only errors); `-v` prints info/warn/debug (frames, control) + timestamps |
| `--serial` / `--emulator` / `--avd` | `ANDROID_SERIAL` | first running device | device to stream (adb serial or AVD name) |
| `--capture` | `CAPTURE` | `screenrecord` | `screenrecord`, `scrcpy`, or `grpc` (emulator-only) |
| `--max-size` | `STREAM_DROID_MAX_SIZE` | `0` (native) | downscale capture so its longer edge ≤ px (h264 backends) — cuts encode cost + bandwidth |
| `--bit-rate` | `STREAM_DROID_BIT_RATE` | backend default | encoder bit-rate, e.g. `4000000`, `3M`, `800K` (h264 backends) |
| `--scrcpy-server` | `SCRCPY_SERVER_JAR` | auto-download | scrcpy-server jar; omit to auto-download the pinned v4.1 jar |
| `--scrcpy-control` | `SCRCPY_CONTROL` | `on` | `off` routes input via `adb input` even in scrcpy mode |

```bash
stream-droid                       # stream the running emulator, open the browser
stream-droid Pixel_9 --headless    # boot + stream Pixel_9, no browser window
stream-droid --capture scrcpy      # high-FPS backend (v4.1 jar auto-downloads)
stream-droid --serial emulator-5554 --port 4000
stream-droid --tunnel-control      # share a controllable public link + QR
stream-droid -l Pixel_9            # tail colourised logcat, no server
```

Full flag/command reference: [skills/drive/references/cli.md](skills/drive/references/cli.md).

## How it works

A bun server bridges the browser to the device: a chosen **capture backend**
produces the video (H.264) or PNG frames, streamed over a WebSocket; the React
client renders `<video>` (via jMuxer/MSE) or `<canvas>`; and control messages are
injected back through gRPC, the scrcpy control socket, or `adb input`. Coordinates
are normalized so taps stay correct across resolutions and rotation.

→ Architecture, the capture/render pipeline, and design notes (instant-preview
poster, headless boot, one-pipe-per-client): **[docs/architecture.md](docs/architecture.md)**.

## Agent usage

The `stream-droid` plugin ships four focused agent skills so an AI agent can work
a device through the server:

| Skill | For |
|---|---|
| [`/stream-droid:drive`](skills/drive/SKILL.md) | the see & act loop — `shot` → `ui` → `tap` / `type` / `swipe` / `key` |
| [`/stream-droid:emulators`](skills/emulators/SKILL.md) | list / boot (headless) / kill AVDs |
| [`/stream-droid:apps`](skills/apps/SKILL.md) | list packages, launch or foreground an app |
| [`/stream-droid:share`](skills/share/SKILL.md) | expose the session as a public link + QR |

The `drive` skill's helper starts the server for you and wraps the loop:

```bash
stream-droid-server             # start the server headless (if needed)
stream-droid-check                     # verify prerequisites
drive shot                # screen.png
drive ui internet         # elements matching "internet"
drive tap:text "Network & internet"
stream-droid-server --stop      # stop the background server when done
```

The helper scripts are plain ESM and run under **bun or node ≥ 18**.

### Install the skills

**Claude Code** — the repo is a self-contained plugin marketplace, so add it and
install straight from the Claude Code prompt:

```
/plugin marketplace add davidokonji/stream-droid
/plugin install stream-droid@stream-droid
```

The skills then surface as **`/stream-droid:drive`**, **`:emulators`**,
**`:apps`**, and **`:share`** (run `/reload-plugins` if they don't show up right
away). To update later: `/plugin marketplace update stream-droid` then
`/plugin update stream-droid@stream-droid`.

**Any agent (skills.sh)** — install from the GitHub repo with the
[skills.sh](https://skills.sh) CLI, no separate registry:

```bash
npx skills add davidokonji/stream-droid
```

**Manual** — copy the `skills/` tree into `~/.claude/skills/` (personal, every
project) or `.claude/skills/` (checked into a specific repo). The sibling skills
share the `drive` skill's scripts, so copy the whole tree, not one folder.

### Updating the skills

**Claude Code** — updates are manual by default (enable per-marketplace
auto-update under `/plugin` → **Marketplaces** to skip this):

```
/plugin marketplace update stream-droid     # refresh the catalog from GitHub
/plugin update stream-droid@stream-droid     # pull the new version
/reload-plugins                              # load it into the session
```

Claude Code decides an update is available by comparing the plugin's advertised
**marketplace** version, which advances **only on a stable release** — so
in-progress changes on branches never prompt installed users to update. Releases
are cut via the publish-stable workflow (see [docs/PUBLISHING.md](docs/PUBLISHING.md)).

**skills.sh** — re-run `npx skills add davidokonji/stream-droid`. **Manual** —
re-copy the `skills/` tree.

Each skill's task references live in its own `references/` folder. Full publishing,
install, and update details are in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Local development

```bash
bun install
bun start            # build css + client, then run (opens browser)
bun run build        # build:css + build:client
bun run check        # oxlint + oxfmt --check + tsc --noEmit   ← run before every PR
bun test             # unit tests (bun:test), in __tests__/ folders
bun run typecheck    # tsc --noEmit
```

Lint/format is [OXC](https://oxc.rs) — `oxlint` (`.oxlintrc.json`) + `oxfmt`
(`.oxfmtrc.json`), **not** ESLint/Prettier. Run the server directly during dev
with `bun run src/server.ts [name] [flags]` (use `-d` so it doesn't pop a browser
tab). Unit tests are `bun test` (focused on pure logic); most behaviour is
verified against a real emulator (see AGENTS.md).

The full source map, conventions, and architecture gotchas for contributors and
agents live in **[AGENTS.md](AGENTS.md)** (`CLAUDE.md` is a symlink to it).

## Contributing

Issues and PRs welcome. Before opening a PR: run **`bun run check`** (it must exit
0 — lint clean, formatted, type-clean), follow the conventions in
[AGENTS.md](AGENTS.md), and keep this README and the docs in sync when you change
flags, commands, or behaviour. Release and publishing steps are in
[docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

[MIT](LICENSE) © David Okonji. Inspired by
[serve-sim](https://github.com/EvanBacon/serve-sim).
