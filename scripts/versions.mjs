#!/usr/bin/env node
// Keep versions consistent across the plugin.
//
//   node scripts/versions.mjs            # sync skill-doc versions to package.json
//   node scripts/versions.mjs --check    # assert versions are consistent (CI guard)
//   node scripts/versions.mjs --release  # ALSO advance the published plugin version
//
// The published plugin version — .claude-plugin/plugin.json (manifest) +
// marketplace.json (listing) — is what Claude Code installs and updates against, so
// it advances ONLY on a stable release (--release, run by publish-stable), never on
// a dev bump. Between releases it lags package.json; --check just rejects it getting
// *ahead*. Skill-doc versions track package.json (they don't gate updates).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');
const release = process.argv.includes('--release');
const want = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const parts = (v) => (v ?? '0.0.0').split('.').map((n) => Number(n) || 0);
const cmp = (a, b) => {
  const [A, B] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return 0;
};

const mismatches = [];
const record = (label, found) => {
  if (found !== want) mismatches.push(`${label}: ${found ?? '(missing)'} (want ${want})`);
};

// --- Skill docs: metadata.version tracks package.json exactly (npm consistency) ---
const skillsDir = join(root, 'skills');
for (const name of readdirSync(skillsDir)) {
  const path = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^(\s*version:\s*)(['"]?)([^'"\n]*)\2\s*$/m);
  record(`skills/${name}/SKILL.md`, m ? m[3] : undefined);
  if (!check && m) writeFileSync(path, raw.replace(m[0], `${m[1]}'${want}'`));
}

// --- Published plugin version: plugin.json (the plugin's manifest) + the
// marketplace listing. These are what Claude Code installs + updates against, so
// they advance ONLY on --release; --check just rejects them getting *ahead* of
// package.json (between releases they lag at the last released version). ---
const releaseManifests = [
  ['.claude-plugin/plugin.json', (o) => o.version, (o) => (o.version = want)],
  [
    '.claude-plugin/marketplace.json',
    (o) => o.plugins?.[0]?.version,
    (o) => o.plugins.forEach((p) => (p.version = want)),
  ],
];
for (const [rel, get, set] of releaseManifests) {
  const path = join(root, rel);
  const obj = JSON.parse(readFileSync(path, 'utf8'));
  const found = get(obj);
  if (release && !check) {
    set(obj);
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  } else if (check && cmp(found, want) > 0) {
    mismatches.push(`${rel}: ${found} is ahead of package.json ${want} (advances only on a stable release)`);
  }
}

if (check) {
  if (mismatches.length) {
    console.error(`Version drift vs package.json (${want}):`);
    for (const line of mismatches) console.error(`  - ${line}`);
    console.error('\nRun `bun run version:sync` and commit.');
    process.exit(1);
  }
  console.log(`✓ versions consistent (package.json ${want})`);
} else if (release) {
  console.log(`Released: synced skill docs + plugin manifest + marketplace → ${want}`);
} else {
  console.log(`Synced skill-doc versions → ${want} (plugin manifest + marketplace left at their release)`);
}
