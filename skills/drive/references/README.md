# drive reference

Reference material for the [`drive` skill](../SKILL.md) — how to use each piece of
driving a device. Load only the file you need.

| Doc | Covers |
|---|---|
| [input-control.md](input-control.md) | tap / swipe / type / keys — coordinates, key names |
| [semantic-layer.md](semantic-layer.md) | reading UI elements + tap-by-element (id / text) |
| [browser-ui.md](browser-ui.md) | the web UI a human can watch: sidebar, LIVE, states, responsive |
| [cli.md](cli.md) | the `stream-droid` CLI: commands, flags, environment variables |
| [agent-skill.md](agent-skill.md) | driving from an AI agent (`ensure-server.mjs` + `drive.mjs`) |

## Sibling skills

Related tasks live in their own skills under this plugin:

- **`/stream-droid:emulators`** — list / boot (headless) / kill AVDs.
- **`/stream-droid:apps`** — list packages, launch or foreground an app.
- **`/stream-droid:share`** — expose the session as a public link + QR.

## Under the hood (contributors)

The capture/render pipeline, the HTTP/WebSocket protocols, and the input paths are
implementation detail — you don't need them to drive a device. They live in the
codebase and its docs: [docs/architecture.md](../../../docs/architecture.md),
[docs/capture-backends.md](../../../docs/capture-backends.md),
[docs/control-and-semantics.md](../../../docs/control-and-semantics.md), and
[AGENTS.md](../../../AGENTS.md).
