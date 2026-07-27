#!/usr/bin/env node
// drive.mjs — one-shot control of a running stream-droid session, for agents.
// Runs under node (≥ 18; control commands need ≥ 22 for WebSocket) or bun. Needs a
// server running locally — start one with `stream-droid-server`.
//
//   drive <command> [args] [--serial <serial|avd>] [--port <n>]
//   drive <command> …
//
// Port: --port or $STREAM_DROID_PORT (default 3200).
// Device: --serial / $STREAM_DROID_SERIAL, else the first running device.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

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
// Where captured files (screenshots, recordings) land, so output stays with the
// caller's work rather than in a scratch/tmp dir. Prefer the caller's project root
// ($CLAUDE_PROJECT_DIR, set by Claude Code) so captures are findable even when an
// agent drives from a temp cwd; fall back to the current folder otherwise. Override
// with --out-dir or $STREAM_DROID_OUT_DIR, or pass an explicit path.
const OUT_DIR =
  opt('--out-dir', 'STREAM_DROID_OUT_DIR') ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const outPath = (name) => (isAbsolute(name) ? name : resolve(OUT_DIR, name));
const LINES = opt('--lines') ?? '200'; // logcat: how many recent lines to dump
const BASE = `http://localhost:${PORT}`;
const [cmd, ...rest] = argv;

// Pretty-print logcat: colourise by level + align the tag on a TTY; plain but
// still aligned when piped, so an agent parsing stdout gets clean text.
const TTY = process.stdout.isTTY;
const ANSI = { reset: '\x1b[0m', dim: '\x1b[2m', gray: '\x1b[90m', blue: '\x1b[34m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', mag: '\x1b[35m' };
const paint = (col, s) => (TTY ? `${ANSI[col]}${s}${ANSI.reset}` : s);
const LVL_COLOR = { V: 'gray', D: 'blue', I: 'green', W: 'yellow', E: 'red', F: 'mag' };
function prettyLogcat(raw, grep) {
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const m = /^([VDIWEF])\/(.+?)\(\s*\d+\):\s?(.*)$/.exec(line);
    if (!m) {
      // e.g. "--------- beginning of main" separators
      if (!grep || line.toLowerCase().includes(grep)) out.push(paint('dim', line));
      continue;
    }
    const [, lvl, rawTag, msg] = m;
    const tag = rawTag.trim();
    if (grep && !`${tag} ${msg}`.toLowerCase().includes(grep)) continue;
    out.push(`${paint(LVL_COLOR[lvl], lvl)}  ${paint('dim', tag.padEnd(22).slice(0, 22))}  ${msg}`);
  }
  return out.join('\n');
}

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

async function state() {
  const r = await fetch(`${BASE}/api/state`).catch(() => null);
  if (!r?.ok) die(`can't reach stream-droid at ${BASE} — start it with: stream-droid-server`);
  return r.json();
}
async function devices() {
  return (await state()).devices;
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

  drive <command> [args] [--serial <serial|avd>] [--port <n>]
  drive <command> …

  devices                     list running devices
  avds [grep]                 list AVDs with running/stopped state (via the server API)
  boot <avd> [--headless]     boot an AVD (POST /api/start); add --cold to skip a
                              (possibly corrupt) saved snapshot and full-boot it
  kill <serial|avd>           shut a running emulator down (POST /api/stop)
  health                      accel/adb/emulator checks + per-device boot readiness
  apps [grep]                 list installed packages + current foreground app
  launch <package>            launch an app by package name
  shot [file]                 save a screenshot PNG (default screen.png)
  record [secs] [file]        record the screen to MP4 (default 10s, screen.mp4)
  logcat [grep] [--lines N]   pretty-print recent device logcat (default 200 lines)
  ui [grep]                   list UI elements (• = clickable); optional text filter
  tap:text <text>             tap the element whose text/desc contains <text>
  tap:id <resource-id>        tap by resource-id (full, or the tail after '/')
  tap <x> <y>                 tap normalized [0..1] coordinates
  longpress <x> <y> [ms]      press and hold (default 500ms)
  swipe <x1> <y1> <x2> <y2>   swipe (normalized) — e.g. 0.5 0.8 0.5 0.2 scrolls up
  scroll <x> <y> <dy> [dx]    scroll at (x,y) by dy (and dx); dy 0.5 ≈ half screen down
  text <string>               type text into the focused field
  key <Name>                  Enter Backspace Tab Home Back AppSwitch Escape Delete
                              Arrow{Up,Down,Left,Right} Page{Up,Down} DpadCenter Menu
                              Search Notifications Power Camera Volume{Up,Down,Mute}
                              Media{PlayPause,Next,Previous}

  Captured files (shot, record) save to your project folder by default
  ($CLAUDE_PROJECT_DIR, else the current folder); pass a path, or set --out-dir /
  $STREAM_DROID_OUT_DIR to save elsewhere.`);
}

async function main() {
  switch (cmd) {
    case 'devices': {
      const devs = await devices();
      console.log(devs.length ? devs.map((d) => `${d.serial}  ${d.avd}`).join('\n') : 'no running devices');
      break;
    }
    case 'avds': {
      const { avds } = await state();
      const grep = rest[0]?.toLowerCase();
      const rows = avds.filter((a) => !grep || a.name.toLowerCase().includes(grep));
      console.log(
        rows.length
          ? rows
              .map((a) => {
                const state = a.running ? '🟢 running' : a.bootError ? '⚠ failed ' : '⚪ stopped';
                const tail = a.serial ? `  ${a.serial}` : a.bootError ? `  — ${a.bootError}` : '';
                return `${state}  ${a.name}${tail}`;
              })
              .join('\n')
          : 'no AVDs found',
      );
      break;
    }
    case 'boot': {
      const headless = rest.includes('--headless') || rest.includes('-d');
      const cold = rest.includes('--cold');
      const avd = need(
        rest.find((a) => !a.startsWith('-')),
        'avd name',
      );
      const r = await fetch(`${BASE}/api/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avd, headless, cold }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) die(`boot failed: ${j.error ?? r.status}`);
      const how = [headless && 'headless', cold && 'cold'].filter(Boolean).join(', ');
      console.log(`booting ${avd}${how ? ` (${how})` : ''}… (~20–60s to come online)`);
      break;
    }
    case 'health': {
      const r = await fetch(`${BASE}/api/health`).catch(() => null);
      if (!r?.ok) die(`can't reach stream-droid at ${BASE} — start it with: stream-droid-server`);
      const h = await r.json();
      const mark = (ok) => (ok ? '✓' : '✗');
      console.log(`${mark(h.adb)} adb    ${mark(h.emulator)} emulator    ${mark(h.accel.ok)} accel — ${h.accel.detail}`);
      if (h.devices.length) {
        for (const d of h.devices) {
          console.log(`${d.booted ? '✓ ready  ' : '⏳ starting'} ${d.serial}  ${d.avd}`);
        }
      } else {
        console.log('(no running devices)');
      }
      break;
    }
    case 'kill': {
      const target = need(rest[0], 'serial or avd name');
      const r = await fetch(`${BASE}/api/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial: target }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) die(`kill failed: ${j.error ?? r.status}`);
      console.log(`killed ${j.serial ?? target}`);
      break;
    }
    case 'shot': {
      const serial = await resolveSerial();
      const file = outPath(rest[0] ?? 'screen.png');
      const r = spawnSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0 || !r.stdout?.length) die('screencap failed (is adb on PATH?)');
      writeFileSync(file, r.stdout);
      console.log(`saved ${file} (${(r.stdout.length / 1024) | 0} KB) from ${serial}`);
      break;
    }
    case 'record': {
      const serial = await resolveSerial();
      const secs = rest[0] ? num(rest[0]) : 10;
      const file = outPath(rest[1] ?? 'screen.mp4');
      const onDevice = '/sdcard/stream-droid-rec.mp4';
      console.log(`recording ${secs}s from ${serial}…`);
      const rec = spawnSync('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', String(secs), onDevice], {
        maxBuffer: 8 * 1024 * 1024,
      });
      if (rec.status !== 0) die('screenrecord failed (physical devices/older emulators may not support it)');
      const pull = spawnSync('adb', ['-s', serial, 'pull', onDevice, file], { maxBuffer: 8 * 1024 * 1024 });
      spawnSync('adb', ['-s', serial, 'shell', 'rm', '-f', onDevice]);
      if (pull.status !== 0) die('could not pull the recording off the device');
      console.log(`saved ${file} from ${serial}`);
      break;
    }
    case 'logcat': {
      // Bounded dump of the most recent lines (not a follow) — agents want a
      // snapshot to reason over, not an endless stream. `--lines N` / optional grep.
      const serial = await resolveSerial();
      const grep = rest[0]?.toLowerCase();
      const r = spawnSync('adb', ['-s', serial, 'logcat', '-d', '-v', 'brief', '-t', LINES], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      if (r.status !== 0) die('logcat failed (is the device online?)');
      const out = prettyLogcat(r.stdout, grep);
      console.log(out || '(no matching logcat lines)');
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
    case 'longpress':
      await control({ type: 'longPress', x: num(rest[0]), y: num(rest[1]), ms: rest[2] ? num(rest[2]) : 500 });
      break;
    case 'swipe':
      await control({ type: 'swipe', x1: num(rest[0]), y1: num(rest[1]), x2: num(rest[2]), y2: num(rest[3]) });
      break;
    case 'scroll':
      await control({ type: 'scroll', x: num(rest[0]), y: num(rest[1]), dy: num(rest[2]), dx: rest[3] ? num(rest[3]) : 0 });
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

// A clean `drive: …` line on any failure (e.g. the server is down, so a bare
// fetch in boot/kill rejects) instead of an unhandled-rejection stack trace.
main().catch((e) => die(e?.message ?? String(e)));
