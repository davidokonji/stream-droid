#!/usr/bin/env node
// Keep the plugin manifests and skill docs in step with package.json.
//
//   node scripts/versions.mjs           # sync: write package.json's version everywhere
//   node scripts/versions.mjs --check   # assert they all match; exit 1 on drift (CI guard)
//
// Targets: .claude-plugin/plugin.json (.version), .claude-plugin/marketplace.json
// (.plugins[].version), and every skills/*/SKILL.md frontmatter metadata.version.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes('--check');
const want = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const mismatches = [];
const record = (label, found) => {
  if (found !== want) mismatches.push(`${label}: ${found ?? '(missing)'} (want ${want})`);
};

// --- JSON manifests ---
function fixJson(rel, get, set) {
  const path = join(root, rel);
  const raw = readFileSync(path, 'utf8');
  const obj = JSON.parse(raw);
  record(rel, get(obj));
  if (!check) {
    set(obj);
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  }
}
fixJson('.claude-plugin/plugin.json', (o) => o.version, (o) => (o.version = want));
fixJson(
  '.claude-plugin/marketplace.json',
  (o) => o.plugins?.[0]?.version,
  (o) => o.plugins.forEach((p) => (p.version = want)),
);

// --- SKILL.md frontmatter (metadata.version) ---
const skillsDir = join(root, 'skills');
for (const name of readdirSync(skillsDir)) {
  const path = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(path)) continue;
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^(\s*version:\s*)(['"]?)([^'"\n]*)\2\s*$/m);
  record(`skills/${name}/SKILL.md`, m ? m[3] : undefined);
  if (!check && m) {
    writeFileSync(path, raw.replace(m[0], `${m[1]}'${want}'`));
  }
}

if (check) {
  if (mismatches.length) {
    console.error(`Version drift vs package.json (${want}):`);
    for (const line of mismatches) console.error(`  - ${line}`);
    console.error('\nRun `bun run version:sync` and commit.');
    process.exit(1);
  }
  console.log(`✓ plugin/skill versions all match package.json (${want})`);
} else {
  console.log(`Synced plugin/skill versions → ${want}`);
}
