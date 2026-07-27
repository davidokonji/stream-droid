#!/usr/bin/env node
// Keep the plugin manifest and skill docs in step with package.json.
//
//   node scripts/versions.mjs            # sync plugin.json + skill docs to package.json
//   node scripts/versions.mjs --check    # assert they match; exit 1 on drift (CI guard)
//   node scripts/versions.mjs --release  # ALSO advance the marketplace listing
//
// The marketplace listing (.claude-plugin/marketplace.json → plugins[].version) is
// what consumers see and update against, so it advances ONLY on a stable release
// (--release, run by the publish-stable workflow) — never on a dev bump. Between
// releases it lags package.json; --check only rejects it getting *ahead*.

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

// --- Dev manifest: plugin.json tracks package.json exactly ---
function fixJson(rel, get, set) {
  const path = join(root, rel);
  const obj = JSON.parse(readFileSync(path, 'utf8'));
  record(rel, get(obj));
  if (!check) {
    set(obj);
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  }
}
fixJson(
  '.claude-plugin/plugin.json',
  (o) => o.version,
  (o) => (o.version = want),
);

// --- Skill docs: metadata.version tracks package.json exactly ---
const skillsDir = join(root, 'skills');
for (const name of readdirSync(skillsDir)) {
  const path = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^(\s*version:\s*)(['"]?)([^'"\n]*)\2\s*$/m);
  record(`skills/${name}/SKILL.md`, m ? m[3] : undefined);
  if (!check && m) writeFileSync(path, raw.replace(m[0], `${m[1]}'${want}'`));
}

// --- Marketplace listing: only bumped on --release; must never be ahead ---
{
  const path = join(root, '.claude-plugin/marketplace.json');
  const obj = JSON.parse(readFileSync(path, 'utf8'));
  const found = obj.plugins?.[0]?.version;
  if (release && !check) {
    obj.plugins.forEach((p) => (p.version = want));
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  } else if (check && cmp(found, want) > 0) {
    mismatches.push(
      `.claude-plugin/marketplace.json: ${found} is ahead of package.json ${want} (it advances only on a stable release)`,
    );
  }
}

if (check) {
  if (mismatches.length) {
    console.error(`Version drift vs package.json (${want}):`);
    for (const line of mismatches) console.error(`  - ${line}`);
    console.error('\nRun `bun run version:sync` and commit.');
    process.exit(1);
  }
  console.log(`✓ plugin/skill versions match package.json (${want})`);
} else if (release) {
  console.log(`Released: synced plugin/skill + marketplace → ${want}`);
} else {
  console.log(`Synced plugin/skill versions → ${want} (marketplace left at its released version)`);
}
