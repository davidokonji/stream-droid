import { execFile, spawnSync } from 'node:child_process';
import type { WebSocket } from 'ws';
import { config } from './config.ts';
import { logger } from './log.ts';
import { listDevices } from './emulator.ts';
import type { CaptureMeta } from './capture/types.ts';

export const adbFor =
  (serial: string) =>
  (...rest: string[]): string[] =>
    serial ? ['-s', serial, ...rest] : rest;

export function targetSerial(): string {
  if (!config.TARGET) return '';
  const t = config.TARGET.toLowerCase();
  return listDevices().find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)?.serial ?? '';
}

export function resolveSerial(requested?: string | null): string {
  if (requested) {
    // Accept only a serial/AVD name that's actually running — don't let a caller
    // point us at an arbitrary adb target.
    const t = requested.toLowerCase();
    return listDevices().find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)?.serial ?? '';
  }
  if (config.TARGET) return targetSerial();
  return listDevices()[0]?.serial ?? '';
}

export function deviceSize(serial: string): CaptureMeta {
  const r = spawnSync('adb', adbFor(serial)('shell', 'wm', 'size'), { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `adb wm size exited ${r.status}`).trim());
  const out = (r.stdout ?? '').trim();
  const m = out.match(/Override size:\s*(\d+)x(\d+)/) ?? out.match(/Physical size:\s*(\d+)x(\d+)/);
  if (!m) throw new Error(`could not parse device size from: ${out}`);
  return { name: serial, w: Number(m[1]), h: Number(m[2]) };
}

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
