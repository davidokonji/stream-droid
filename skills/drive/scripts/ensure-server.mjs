#!/usr/bin/env node
// ensure-server — make sure a stream-droid server is up, then get out of the way.
//
// Checks localhost:<port>/api/state; if nothing answers, it starts the server
// headless in the background (log tucked into a temp file, not your console) and
// waits until it's ready. One quiet line of output either way. Run this instead
// of hand-starting the server and watching its logs.
//
//   bun ensure-server.mjs            # or: node ensure-server.mjs
//   bun ensure-server.mjs --port 4000
//
// Env: STREAM_DROID_PORT overrides the port (default 3200).

import { spawn } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const portArg = argv[argv.indexOf('--port') + 1];
const PORT = Number(portArg || process.env.STREAM_DROID_PORT || 3200);
const HOST = '127.0.0.1';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..'); // skills/drive/scripts -> repo root
const logFile = join(tmpdir(), `stream-droid-${PORT}.log`);

function alive() {
  return new Promise((res) => {
    const req = get({ host: HOST, port: PORT, path: '/api/state', timeout: 800 }, (r) => {
      r.resume();
      res(r.statusCode === 200);
    });
    req.on('error', () => res(false));
    req.on('timeout', () => {
      req.destroy();
      res(false);
    });
  });
}

// How to launch the server: prefer the repo's runtime-agnostic bin; otherwise the
// published package via bunx/npx. Either way it runs headless (-d).
function startCommand() {
  const bin = join(repoRoot, 'bin', 'stream-droid.mjs');
  if (existsSync(bin)) return [process.execPath, [bin, '-d', '--port', String(PORT)]];
  const runner = typeof globalThis.Bun !== 'undefined' ? 'bunx' : 'npx';
  return [runner, ['stream-droid', '-d', '--port', String(PORT)]];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (await alive()) {
    console.log(`stream-droid server already running on :${PORT}`);
    return;
  }

  const [cmd, args] = startCommand();
  const out = openSync(logFile, 'a');
  const child = spawn(cmd, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.on('error', (e) => {
    console.error(`could not start the server (${cmd}): ${e.message}`);
    process.exit(1);
  });
  child.unref();

  // Boot can take a moment (and longer if it also boots an AVD); poll up to ~90s.
  for (let i = 0; i < 180; i++) {
    await sleep(500);
    if (await alive()) {
      console.log(`started stream-droid server on :${PORT} (log: ${logFile})`);
      return;
    }
  }
  console.error(`server did not become ready on :${PORT} within 90s — see ${logFile}`);
  process.exit(1);
}

main();
