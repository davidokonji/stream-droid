import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { config } from '../config.ts';
import type { CaptureHandle, CaptureOptions } from './types.ts';

// A healthy clip runs to its ~3-min limit; anything shorter than this means the
// spawn itself failed (device offline/unauthorized, screenrecord erroring).
const HEALTHY_MS = 1500;
const MAX_FAST_FAILS = 5;

export function startScreenrecord({ adbArgs, onChunk, onError }: CaptureOptions): CaptureHandle {
  let alive = true;
  let child: ChildProcessWithoutNullStreams | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fastFails = 0;

  const spawnOnce = (): void => {
    const startedAt = Date.now();
    child = spawn(
      'adb',
      adbArgs(
        'exec-out',
        'screenrecord',
        '--output-format=h264',
        '--time-limit',
        '180',
        '--bit-rate',
        '4000000',
        '-',
      ),
    );
    child.stdout.on('data', (chunk: Buffer) => onChunk(chunk));
    child.stderr.on('data', (d: Buffer) => {
      if (config.VERBOSE) process.stderr.write(`[screenrecord] ${d}`);
    });
    child.on('exit', () => {
      if (!alive) return;
      if (Date.now() - startedAt >= HEALTHY_MS) {
        fastFails = 0;
        spawnOnce(); // normal ~3-min clip rollover — respawn immediately
        return;
      }
      // Immediate exit: back off exponentially instead of respawning in a tight
      // loop (which would peg a CPU core and flood adb), and give up after a few.
      if (++fastFails >= MAX_FAST_FAILS) {
        onError?.(new Error('screenrecord keeps exiting immediately — device offline or unauthorized?'));
        alive = false;
        return;
      }
      timer = setTimeout(spawnOnce, Math.min(500 * 2 ** (fastFails - 1), 5000));
    });
    child.on('error', (e: Error) => onError?.(e));
  };

  spawnOnce();
  return {
    name: 'screenrecord',
    stop() {
      alive = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      child?.kill('SIGKILL');
    },
  };
}
