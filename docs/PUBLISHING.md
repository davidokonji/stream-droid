# Publishing stream-droid

This repo ships **two products** from one tree:

1. **the npm package** `stream-droid` — the server/CLI (run with `bunx stream-droid`)
2. **the agent skills** `drive` / `emulators` / `apps` / `share` (the
   `stream-droid` plugin, in `skills/`) — publishable to
   [skills.sh](https://skills.sh) and installable as Claude skills

All the metadata is already in place. The commands below are the ones **you** run
(they need your npm and GitHub accounts — they can't be run for you).

---

## 0. One-time prerequisites

```bash
node --version      # ≥ 20
bun --version       # ≥ 1.3.11  (matches .bun-version)
npm whoami          # logged in?  else: npm login
git remote -v       # origin → github.com/davidokonji/stream-droid.git
```

Make sure the working tree is clean and `bun run check` exits 0.

---

## 1. Publish the npm package

The package is public, MIT-licensed, and ships prebuilt browser assets.

**What ships** (the `files` allowlist): `src/`, `public/` (built `client.js` +
`app.css`), `skills/`, `README.md`, `AGENTS.md`, `LICENSE`, `.bun-version`.
`prepublishOnly` runs `bun run build` so `public/` is always freshly built before
packing. Verify the exact contents any time with:

```bash
npm pack --dry-run          # lists every file that would ship (no upload)
```

Then publish:

```bash
# bump the version first (edit package.json or):
npm version patch           # 0.1.0 → 0.1.1   (use minor/major as appropriate)

npm publish                 # publishConfig.access is "public", so scoped isn't needed
```

Consumers run it under **bun or node**:

```bash
bunx stream-droid           # bun — runs the TypeScript natively
npx stream-droid            # node — runs it via tsx (bun not required)
```

> The `bin` (`bin/stream-droid.mjs`) detects the runtime (`typeof Bun`): bun runs
> the TS natively, node runs it via `tsx` (a dependency). The shipped package
> includes prebuilt `public/` assets, so no build step runs on the user's machine.
> Building from source still uses bun.

### Notes / gotchas

- **Name is free.** `stream-droid` is unclaimed on npm (checked). The first
  `npm publish` claims it for your account.
- **`.npmignore` is intentional.** It exists so npm does *not* fall back to
  `.gitignore` (which excludes the built `public/client.js` / `public/app.css`
  the package must ship). Don't delete it.
- **2FA:** if your npm account has 2FA on publish, add `--otp=<code>`.
- **Dry run the whole thing:** `npm publish --dry-run`.

---

## 2. Publish the skill to skills.sh

skills.sh installs skills straight from a **public GitHub repo** — no separate
upload. The repo already has the required shape:

```
skills.sh.json                     ← manifest at repo root (groupings)
skills/
  drive/                           ← the see & act loop (base skill)
    SKILL.md                       ← name, description, license, metadata
    scripts/   ensure-server.mjs, drive.mjs, check.mjs
    references/  cli.md, input-control.md, …   ← plural, per the spec
  emulators/  SKILL.md + references/   ← list / boot / kill AVDs
  apps/       SKILL.md + references/   ← list / launch / foreground apps
  share/      SKILL.md + references/   ← public link + QR
```

The `emulators`, `apps`, and `share` skills reuse the `drive` skill's scripts
(referenced via `$CLAUDE_PLUGIN_ROOT`), so they're shipped and installed together.

Steps:

```bash
git add -A
git commit -m "Make stream-droid npm- and skill-publishable"
git push origin main               # repo must be PUBLIC on GitHub
```

Anyone (including you) can then install the skill into their agent with:

```bash
npx skills add davidokonji/stream-droid
```

That drops the `skills/` tree (the `drive`, `emulators`, `apps`, and `share`
skills) into the local agent's skills directory. The root `skills.sh.json` groups
them under **Android** in the skills.sh UI. To update later, re-run the same
`npx skills add …` command.

To list it on the skills.sh directory, follow their submission flow at
<https://skills.sh> (point it at `github.com/davidokonji/stream-droid`).

---

## 3. Install as a Claude skill

Each `SKILL.md` follows the [agentskills.io](https://agentskills.io/specification)
spec, which is the same format Claude Code uses for skills — so they work as-is.
The plugin ships **four** skills: `drive`, `emulators`, `apps`, `share`. Three
ways to install:

**A. Via the Claude Code plugin marketplace (recommended for Claude).** The repo
is a self-contained marketplace + plugin (`.claude-plugin/marketplace.json` +
`plugin.json`); the skills under `skills/*/` are auto-discovered.

```
/plugin marketplace add davidokonji/stream-droid
/plugin install stream-droid@stream-droid
/reload-plugins
```

The skills then surface as **`/stream-droid:drive`**, **`:emulators`**,
**`:apps`**, and **`:share`** (plugin skills are always namespaced `plugin:skill`).

**B. Via the skills CLI (same as skills.sh):**

```bash
npx skills add davidokonji/stream-droid
```

**C. Manual copy.** The sibling skills share the `drive` skill's scripts, so copy
the whole `skills/` tree — not one folder — into `~/.claude/skills/` (personal) or
`.claude/skills/` (checked into a repo):

```bash
mkdir -p ~/.claude/skills
cp -R skills/* ~/.claude/skills/
```

Restart Claude Code (or reload skills). The agent surfaces these skills whenever a
task involves an Android emulator/device — building or testing an Expo, React
Native, Flutter, or native Android app. The `drive` skill starts the server for
you (`scripts/ensure-server.mjs`).

> The helper scripts (`ensure-server.mjs`, `drive.mjs`, `check.mjs`) are plain ESM
> and run under **bun or node ≥ 18** — only the server itself needs bun.

### Updating an installed plugin

Plugin updates are **manual by default** (users can opt into background
auto-update per marketplace via `/plugin` → **Marketplaces** → *Enable
auto-update*). To pull a new version:

```
/plugin marketplace update stream-droid     # refresh marketplace.json from GitHub
/plugin update stream-droid@stream-droid     # update the installed plugin
```

Claude Code decides an update is available by comparing the **published plugin
version** against what's installed — so that version must advance **only on a
stable release**, never on a dev bump. This is automated and enforced:

- The published plugin version is `.claude-plugin/plugin.json` (the manifest),
  `.claude-plugin/marketplace.json` (the listing), and every `skills/*/SKILL.md`
  (`metadata.version`) — one version, moved as a unit. `package.json` is the
  separate dev/npm version and iterates freely; nothing follows it on a dev bump,
  so in-progress branch work never advertises itself to installed users.
- `bun run version:release` advances the published version to `package.json`'s.
  Only the **stable release** workflow runs it (after `npm version`), so it moves
  exactly once per release.
- **CI guards it** — `bun run version:check` fails if the published files disagree
  with each other, or if the published version gets *ahead* of `package.json`
  (between releases it lags at the last released version, which is expected).

You don't hand-bump versions on a dev change — only a stable release moves them.
skills.sh installs update by re-running `npx skills add davidokonji/stream-droid`.

---

## 4. Continuous integration & automated releases

Four GitHub Actions workflows are in `.github/workflows/`:

- **`ci.yml`** — on every push/PR to `main`: `bun install`, then lint (oxlint),
  format check (oxfmt), typecheck (tsc), and build. This is the green-check gate.
- **`publish-beta.yml`** — **opt-in**. Runs only when a commit on `main` includes
  **`[beta]`** in its message, or when the workflow is dispatched manually — a
  plain merge cuts no beta. It runs the checks, publishes a **beta** to npm as
  `<version>-beta.<run_number>` under the `beta` dist-tag (never `latest`), then
  tags that commit and cuts a **GitHub prerelease** `v<version>-beta.<run_number>`.
- **`publish-stable.yml`** — **manual** (`workflow_dispatch`) from the Actions
  tab. Pick a **release type** (`patch` / `minor` / `major`); the workflow bumps
  `package.json`, commits + tags it, pushes to `main`, publishes to the default
  **`latest`** dist-tag, cuts a **GitHub release** `v<version>`, and then deploys
  the TypeDoc site to GitHub Pages.
- **`deploy-docs.yml`** — **manual** (`workflow_dispatch`). Rebuilds the TypeDoc
  site (`bun run docs:api`) and deploys it to GitHub Pages **without** touching
  the version or cutting a release. Use it to push docs-only changes (guides under
  `docs/`, the README, or API comments) live between releases; dispatch it from
  the branch whose docs you want published (usually `main`). It only needs Pages
  permissions (`pages: write` + `id-token: write`) — no `contents: write`.

Both publish workflows publish with `--provenance` and are **gated to this repo**
(`github.repository == 'davidokonji/stream-droid'`) so forks can never publish.
Both need `contents: write` + `id-token: write`:

- **beta** — `contents: write` to create the prerelease + tag; `id-token: write`
  for provenance. It does **not** commit the bump to `main` (in-place
  `npm version --no-git-tag-version`; the tag points at the built commit), and it
  runs **only** for commits whose message contains **`[beta]`** (or a manual
  dispatch).
- **stable** — `contents: write` to push the version-bump commit/tag and create
  the release; `id-token: write` for provenance.

> Beta tags are created via `GITHUB_TOKEN`, so they don't re-trigger
> `publish-stable` (and a `-beta.N` tag wouldn't match its version guard anyway).

### Cutting a beta

Betas are **opt-in** — a plain merge publishes nothing. To cut one, either:

- put **`[beta]`** in the commit message you land on `main` (e.g. a squash-merge
  titled `Fix streaming stall [beta]`), **or**
- Actions tab → **Publish beta** → *Run workflow* (manual dispatch).

Either publishes `<version>-beta.<run_number>` under the `beta` dist-tag and cuts a
GitHub prerelease. Install with `bunx stream-droid@beta`.

### Cutting a stable release

Actions tab → **Publish stable** → *Run workflow* → choose `patch` / `minor` /
`major`. The workflow then:

1. runs `bun run check`;
2. `npm version <type>` bumps `package.json`, then `version:release` advances the
   published plugin version (manifests + skills) to match; commits + tags the lot;
3. pushes the commit and tag (via `GITHUB_TOKEN`, which doesn't trigger other
   workflows — and the release commit carries no `[beta]`, so no beta is cut);
4. `npm publish --provenance` → **`latest`**;
5. `gh release create v<version> --generate-notes` → a **GitHub release**.

> If `main` is a protected branch, allow `github-actions[bot]` to push to it (or
> the version-bump push in step 3 will be rejected).

### Required setup (one-time)

1. Create an **npm automation token** (npmjs.com → Access Tokens → *Automation*).
2. Add it as a repo secret named **`NPM_TOKEN`**
   (GitHub → Settings → Secrets and variables → Actions → *New repository secret*).
3. Provenance needs a **public** repo. If the repo is private, remove
   `--provenance` from both `publish-beta.yml` and `publish-stable.yml`.

Consumers install:

```bash
bunx stream-droid          # latest stable
bunx stream-droid@beta     # newest beta
```

## Release checklist (stable)

- [ ] CI green on `main`; `npm pack --dry-run` shows `public/client.js`, `public/app.css`, `src/`, `skills/`
- [ ] The published plugin version (plugin manifests + skills) advances only on the
      release (`version:release` runs in the release commit; CI's `version:check`
      guards it) — no manual version edits needed
- [ ] Actions tab → **Publish stable** → *Run workflow* → pick `patch` / `minor` / `major`
- [ ] Confirm the run is green (it bumps, tags, pushes, and publishes `latest`)
- [ ] Smoke test: `bunx stream-droid@<version> -h`
