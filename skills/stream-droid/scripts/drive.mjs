#!/usr/bin/env node
// drive.mjs — one-shot control of a running stream-droid session, for agents.
// Runs under bun or node ≥ 18. The server must be running locally
// (e.g. `bun run src/server.ts -d`).
//
//   bun scripts/drive.mjs <command> [args] [--serial <serial|avd>] [--port <n>]
//   node scripts/drive.mjs <command> …
//
// Port: --port or $STREAM_DROID_PORT (default 3200).
// Device: --serial / $STREAM_DROID_SERIAL, else the first running device.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (flag, env) => {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1]) {
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  }
  return env ? process.env[env] : undefined;
};
const PORT = opt('--port', 'STREAM_DROID_PORT') ?? '3200';
const SERIAL_ARG = opt('--serial', 'STREAM_DROID_SERIAL');
const BASE = `http://localhost:${PORT}`;
const [cmd, ...rest] = argv;

const die = (msg) => {
  console.error(`drive: ${msg}`);
  process.exit(1);
};
const need = (v, what) => (v ? v : die(`missing ${what}`));
const num = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? die('expected a number') : n;
};

// WebSocket: global on bun / node ≥ 22, else the `ws` package (a repo dependency).
async function getWebSocket() {
  if (typeof globalThis.WebSocket !== 'undefined') return globalThis.WebSocket;
  try {
    return (await import('ws')).default;
  } catch {
    return die('no WebSocket available — use bun, node ≥ 22, or run from the repo (needs the `ws` dep)');
  }
}

async function devices() {
  const r = await fetch(`${BASE}/api/state`).catch(() => null);
  if (!r?.ok) die(`can't reach stream-droid at ${BASE} — is it running? (bun run src/server.ts -d)`);
  return (await r.json()).devices;
}

async function resolveSerial() {
  const devs = await devices();
  if (SERIAL_ARG) {
    const t = SERIAL_ARG.toLowerCase();
    const hit = devs.find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t);
    return hit ? hit.serial : die(`no running device matching "${SERIAL_ARG}"`);
  }
  return devs[0]?.serial ?? die('no running device — start an emulator');
}

// Send one control message over the WebSocket, then close.
async function control(msg) {
  const serial = await resolveSerial();
  const WS = await getWebSocket();
  await new Promise((resolve) => {
    const ws = new WS(`ws://localhost:${PORT}/?serial=${encodeURIComponent(serial)}`);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(msg));
      // give the server time to act (tapElement first dumps the hierarchy)
      setTimeout(() => {
        ws.close();
        resolve();
      }, 700);
    });
    ws.addEventListener('error', () => resolve());
  });
}

function help() {
  console.log(`drive.mjs — control a running stream-droid session

  bun scripts/drive.mjs <command> [args] [--serial <serial|avd>] [--port <n>]
  node scripts/drive.mjs <command> …

  devices                     list running devices
  apps [grep]                 list installed packages + current foreground app
  launch <package>            launch an app by package name
  shot [file]                 save a screenshot PNG (default screen.png)
  ui [grep]                   list UI elements (• = clickable); optional text filter
  tap:text <text>             tap the element whose text/desc contains <text>
  tap:id <resource-id>        tap by resource-id (full, or the tail after '/')
  tap <x> <y>                 tap normalized [0..1] coordinates
  swipe <x1> <y1> <x2> <y2>   swipe (normalized) — e.g. 0.5 0.8 0.5 0.2 scrolls up
  text <string>               type text into the focused field
  key <Name>                  Enter|Backspace|Tab|Home|Back|AppSwitch|Arrow{Up,Down,Left,Right}`);
}

async function main() {
  switch (cmd) {
    case 'devices': {
      const devs = await devices();
      console.log(devs.length ? devs.map((d) => `${d.serial}  ${d.avd}`).join('\n') : 'no running devices');
      break;
    }
    case 'shot': {
      const serial = await resolveSerial();
      const file = rest[0] ?? 'screen.png';
      const r = spawnSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0 || !r.stdout?.length) die('screencap failed (is adb on PATH?)');
      writeFileSync(file, r.stdout);
      console.log(`saved ${file} (${(r.stdout.length / 1024) | 0} KB) from ${serial}`);
      break;
    }
    case 'ui': {
      const serial = await resolveSerial();
      const r = await fetch(`${BASE}/api/hierarchy?serial=${encodeURIComponent(serial)}`);
      if (!r.ok) die(`hierarchy failed (${r.status})`);
      const { nodes } = await r.json();
      const grep = rest[0]?.toLowerCase();
      for (const n of nodes) {
        const label = n.text || n.desc;
        if (!label && !n.resourceId) continue;
        if (grep && !`${label} ${n.resourceId}`.toLowerCase().includes(grep)) continue;
        const id = n.resourceId ? n.resourceId.split('/').pop() : '';
        console.log(`${n.clickable ? '•' : ' '} ${label || '—'}${id ? `  #${id}` : ''}  @${n.center[0]},${n.center[1]}`);
      }
      break;
    }
    case 'apps': {
      const serial = await resolveSerial();
      const r = await fetch(`${BASE}/api/apps?serial=${encodeURIComponent(serial)}`);
      if (!r.ok) die(`apps failed (${r.status})`);
      const { foreground, packages } = await r.json();
      if (foreground) console.log(`foreground: ${foreground}\n`);
      const grep = rest[0]?.toLowerCase();
      for (const p of packages) if (!grep || p.toLowerCase().includes(grep)) console.log(p);
      break;
    }
    case 'launch': {
      const pkg = need(rest[0], 'package');
      const serial = await resolveSerial();
      const r = await fetch(`${BASE}/api/launch?serial=${encodeURIComponent(serial)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: pkg }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) die(`launch failed: ${j.error ?? r.status}`);
      console.log(`launched ${pkg}`);
      break;
    }
    case 'tap:text':
      await control({ type: 'tapElement', text: need(rest[0], 'text') });
      break;
    case 'tap:id':
      await control({ type: 'tapElement', id: need(rest[0], 'resource-id') });
      break;
    case 'tap':
      await control({ type: 'tap', x: num(rest[0]), y: num(rest[1]) });
      break;
    case 'swipe':
      await control({ type: 'swipe', x1: num(rest[0]), y1: num(rest[1]), x2: num(rest[2]), y2: num(rest[3]) });
      break;
    case 'text':
      await control({ type: 'text', value: need(rest.join(' '), 'text') });
      break;
    case 'key':
      await control({ type: 'key', key: need(rest[0], 'key name') });
      break;
    case undefined:
    case '-h':
    case '--help':
      help();
      break;
    default:
      die(`unknown command "${cmd}". Run --help.`);
  }
}

void main();
