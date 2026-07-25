# Publishing stream-droid

This repo ships **two products** from one tree:

1. **the npm package** `stream-droid` — the server/CLI (run with `bunx stream-droid`)
2. **the agent skill** `stream-droid` (in `skills/stream-droid/`) — publishable to
   [skills.sh](https://skills.sh) and installable as a Claude skill

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
  stream-droid/
    SKILL.md                       ← name, description, license, metadata
    scripts/   drive.mjs, check.mjs
    references/  cli.md, http-api.md, …   ← plural, per the spec
```

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

That drops `skills/stream-droid/` into the local agent's skills directory. The
root `skills.sh.json` groups it under **Android** in the skills.sh UI.

To list it on the skills.sh directory, follow their submission flow at
<https://skills.sh> (point it at `github.com/davidokonji/stream-droid`).

---

## 3. Install as a Claude skill

`SKILL.md` follows the [agentskills.io](https://agentskills.io/specification)
spec, which is the same format Claude Code uses for skills — so it works as-is.
Four ways to install:

**A. Via the Claude Code plugin marketplace (recommended for Claude).** The repo
is a self-contained marketplace + plugin (`.claude-plugin/marketplace.json` +
`plugin.json`); the skill under `skills/stream-droid/` is auto-discovered.

```
/plugin marketplace add davidokonji/stream-droid
/plugin install stream-droid@stream-droid
/reload-plugins
```

The skill then surfaces as **`/stream-droid:stream-droid`**. Bumping the plugin's
`version` in both `.claude-plugin/*.json` (keep it in step with `package.json`) is
what tells installed users an update is available.

**B. Via the skills CLI (same as skills.sh):**

```bash
npx skills add davidokonji/stream-droid
```

**C. Personal skill (available in every project):**

```bash
mkdir -p ~/.claude/skills
cp -R skills/stream-droid ~/.claude/skills/stream-droid
```

**D. Project skill (checked in for a specific repo):**

```bash
mkdir -p .claude/skills
cp -R skills/stream-droid .claude/skills/stream-droid
```

Restart Claude Code (or reload skills). The agent will surface **stream-droid**
whenever a task involves seeing or driving an Android emulator/device. It expects
a stream-droid server running locally — see the skill's Prerequisites section
(`bun run src/server.ts -d`, then `node scripts/check.mjs` to verify).

> The skill's helper scripts (`scripts/drive.mjs`, `scripts/check.mjs`) are plain
> ESM and run under **bun or node ≥ 18** — only the server itself needs bun.

---

## 4. Continuous integration & automated releases

Four GitHub Actions workflows are in `.github/workflows/`:

- **`ci.yml`** — on every push/PR to `main`: `bun install`, then lint (oxlint),
  format check (oxfmt), typecheck (tsc), and build. This is the green-check gate.
- **`publish-beta.yml`** — on a push/merge to `main` that touches package files
  (`package.json`, `bun.lock`, `src/**`, `public/**`, `skills/**`): runs the
  checks, publishes a **beta** to npm as `<version>-beta.<run_number>` under the
  `beta` dist-tag (never `latest`), then tags that commit and cuts a **GitHub
  prerelease** `v<version>-beta.<run_number>`.
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
  skips any commit whose message contains **`[skip beta]`**.
- **stable** — `contents: write` to push the version-bump commit/tag and create
  the release; `id-token: write` for provenance.

> Beta tags are created via `GITHUB_TOKEN`, so they don't re-trigger
> `publish-stable` (and a `-beta.N` tag wouldn't match its version guard anyway).

### Cutting a stable release

Actions tab → **Publish stable** → *Run workflow* → choose `patch` / `minor` /
`major`. The workflow then:

1. runs `bun run check`;
2. `npm version <type> -m "release: %s [skip beta]"` — bumps `package.json`,
   commits + tags;
3. pushes the commit and tag (via `GITHUB_TOKEN`, which doesn't trigger other
   workflows, so no beta is cut — the `[skip beta]` message is a backstop);
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
- [ ] If the skill/plugin changed, bump the version in `skills/stream-droid/SKILL.md`
      (`metadata.version`) **and** both `.claude-plugin/*.json` to match, and commit to `main` first
- [ ] Actions tab → **Publish stable** → *Run workflow* → pick `patch` / `minor` / `major`
- [ ] Confirm the run is green (it bumps, tags, pushes, and publishes `latest`)
- [ ] Smoke test: `bunx stream-droid@<version> -h`
