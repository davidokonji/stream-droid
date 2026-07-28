#!/usr/bin/env node
// check.mjs — verify stream-droid prerequisites before driving a device.
// Runs under bun or node ≥ 18. Exit 0 when ready, 1 when a hard requirement is missing.
//   stream-droid-check   |   stream-droid-check   [--port <n>]

import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = argv.indexOf('--port');
const PORT = (flag !== -1 && argv[flag + 1]) || process.env.STREAM_DROID_PORT || '3200';

let ok = true;
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m, hint) => console.log(`  \x1b[33m⚠\x1b[0m ${m}\n      ${hint}`);
const bad = (m, hint) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}\n      → ${hint}`);
  ok = false;
};

console.log('stream-droid prerequisites:\n');

// runtime — bun or node.
pass(typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`);

// adb — mandatory.
const adb = spawnSync('adb', ['version'], { encoding: 'utf8' });
if (adb.error) {
  bad('adb not found on PATH', 'brew install --cask android-platform-tools  (or add $ANDROID_HOME/platform-tools)');
} else {
  pass(adb.stdout.split('\n')[0].trim() || 'adb present');
  const devs = spawnSync('adb', ['devices'], { encoding: 'utf8' })
    .stdout.split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter(([s, state]) => s && state === 'device')
    .map(([s]) => s);
  if (devs.length) pass(`${devs.length} connected device(s): ${devs.join(', ')}`);
  else warn('no connected device', 'start an emulator, or run the server with a name to boot one');
}

// stream-droid server — the skill needs it running.
try {
  const res = await fetch(`http://localhost:${PORT}/api/state`);
  if (!res.ok) throw new Error(String(res.status));
  const st = await res.json();
  pass(`server on :${PORT}  (capture: ${st.capture}${st.target ? `, target: ${st.target}` : ''})`);
  if (st.devices.length) pass(`server can stream: ${st.devices.map((d) => `${d.avd}(${d.serial})`).join(', ')}`);
  else warn('server is up but has no device to stream', 'boot one from the sidebar or start an AVD');
} catch {
  bad(`server not reachable on :${PORT}`, 'start it first:  stream-droid-server');
}

console.log(
  ok
    ? '\n\x1b[32mReady.\x1b[0m Use `drive` (or `drive`) to drive the device.'
    : '\n\x1b[31mNot ready.\x1b[0m',
);
process.exit(ok ? 0 : 1);
