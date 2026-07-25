// adb / device helpers: build device-scoped adb argv, resolve which device to
// stream, read the display size, and grab a poster screenshot.

import { execFile, execFileSync } from 'node:child_process';
import type { WebSocket } from 'ws';
import { config } from './config.ts';
import { logger } from './log.ts';
import { listDevices } from './emulator.ts';
import type { CaptureMeta } from './capture/types.ts';

// `adb` argv builder scoped to a specific device serial.
export const adbFor =
  (serial: string) =>
  (...rest: string[]): string[] =>
    serial ? ['-s', serial, ...rest] : rest;

// The running serial matching config.TARGET (by adb serial or AVD name,
// case-insensitive), or '' if the target isn't running (e.g. still booting).
export function targetSerial(): string {
  if (!config.TARGET) return '';
  const t = config.TARGET.toLowerCase();
  return listDevices().find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)?.serial ?? '';
}

// Which device a connection should target: explicit request > TARGET > first device.
export function resolveSerial(requested?: string | null): string {
  if (requested) return requested;
  if (config.TARGET) return targetSerial();
  return listDevices()[0]?.serial ?? '';
}

// `wm size` → "Physical size: 1080x2400" (may also report an Override size).
export function deviceSize(serial: string): CaptureMeta {
  const out = execFileSync('adb', adbFor(serial)('shell', 'wm', 'size'), { encoding: 'utf8' }).trim();
  const m = out.match(/Override size:\s*(\d+)x(\d+)/) ?? out.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!m) throw new Error(`could not parse device size from: ${out}`);
  return { name: serial, w: Number(m[1]), h: Number(m[2]) };
}

// Grab a single screenshot (`screencap -p` → PNG) and send it as a one-shot
// poster for an instant preview. `exec-out` avoids the tty CRLF translation that
// would corrupt the PNG.
export function sendPoster(ws: WebSocket, adbArgs: (...r: string[]) => string[]): void {
  execFile(
    'adb',
    adbArgs('exec-out', 'screencap', '-p'),
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
    (err, stdout: Buffer) => {
      if (err || ws.readyState !== ws.OPEN || stdout.length === 0) return;
      ws.send(JSON.stringify({ type: 'poster' }));
      ws.send(stdout);
      logger('poster').debug(`sent ${(stdout.length / 1024) | 0}KB preview`);
    },
  );
}
