#!/usr/bin/env node
// Guard/advance the published plugin version.
//
//   node scripts/versions.mjs --check    # assert the published version is consistent
//                                         # and not ahead of package.json (CI guard)
//   node scripts/versions.mjs --release  # advance it to package.json's version
//
// The published plugin version — .claude-plugin/plugin.json (manifest),
// marketplace.json (listing), and every skills/*/SKILL.md (metadata.version) — is
// what Claude Code installs and updates against, so it advances ONLY on a stable
// release (--release, run by publish-stable). package.json is the dev/npm version
// and iterates freely; between releases the published version lags it, which is
// expected — --check only rejects the published version getting *ahead*.

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

// Every file carrying the published version, each with a read + write of it.
const jsonField = (rel, get, set) => {
  const path = join(root, rel);
  return {
    label: rel,
    read: () => get(JSON.parse(readFileSync(path, 'utf8'))),
    write: (v) => {
      const o = JSON.parse(readFileSync(path, 'utf8'));
      set(o, v);
      writeFileSync(path, `${JSON.stringify(o, null, 2)}\n`);
    },
  };
};
const skillField = (label, path) => {
  const re = /^(\s*version:\s*)(['"]?)([^'"\n]*)\2\s*$/m;
  return {
    label,
    read: () => readFileSync(path, 'utf8').match(re)?.[3],
    write: (v) => {
      const raw = readFileSync(path, 'utf8');
      const m = raw.match(re);
      if (m) writeFileSync(path, raw.replace(m[0], `${m[1]}'${v}'`));
    },
  };
};

const fields = [
  jsonField('.claude-plugin/plugin.json', (o) => o.version, (o, v) => (o.version = v)),
  jsonField(
    '.claude-plugin/marketplace.json',
    (o) => o.plugins?.[0]?.version,
    (o, v) => o.plugins.forEach((p) => (p.version = v)),
  ),
];
const skillsDir = join(root, 'skills');
for (const name of readdirSync(skillsDir)) {
  const path = join(skillsDir, name, 'SKILL.md');
  if (existsSync(path)) fields.push(skillField(`skills/${name}/SKILL.md`, path));
}

if (release) {
  for (const f of fields) f.write(want);
  console.log(`Released: published plugin version → ${want}`);
} else if (check) {
  const found = fields.map((f) => ({ label: f.label, v: f.read() }));
  const ref = found[0].v; // they should all agree — the last released version
  const problems = found
    .filter(({ v }) => v !== ref)
    .map(({ label, v }) => `${label}: ${v ?? '(missing)'} — published versions disagree (expected ${ref})`);
  if (cmp(ref, want) > 0) {
    problems.push(`published version ${ref} is ahead of package.json ${want} (it advances only on a stable release)`);
  }
  if (problems.length) {
    console.error('Published plugin version issue:');
    for (const line of problems) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`✓ published plugin version ${ref} (package.json is ${want})`);
} else {
  console.error('Nothing to do without a flag. Use --check (CI guard) or --release (stable release only).');
  process.exit(1);
}
