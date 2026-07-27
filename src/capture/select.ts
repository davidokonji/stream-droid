import { match } from 'ts-pattern';
import { config } from '../config.ts';
import { logger } from '../log.ts';
import { startScreenrecord } from './screenrecord.ts';
import { startScrcpy } from './scrcpy.ts';
import { startGrpc } from './grpc.ts';
import type { CaptureHandle, CaptureMeta } from './types.ts';

let scrcpyPort = 27183; // bumped per connection so reconnects don't collide

// Scale a device WxH down so its longer edge is at most `maxSize`, keeping aspect
// and even dimensions (the encoder needs them). Returns undefined when no
// downscale applies (maxSize 0, or already within it) → capture at native size.
function scaledSize(w: number, h: number, maxSize: number): string | undefined {
  if (!maxSize || Math.max(w, h) <= maxSize) return undefined;
  const f = maxSize / Math.max(w, h);
  const even = (n: number): number => {
    const v = Math.round(n * f);
    return v - (v % 2);
  };
  return `${even(w)}x${even(h)}`;
}

export function startCapture(
  serial: string,
  adbArgs: (...r: string[]) => string[],
  size: CaptureMeta,
  onChunk: (c: Buffer) => void,
  // Called when the capture pipe ends for good (device closed, stream errored) —
  // the caller uses this to close the socket so the client isn't left frozen.
  onEnd?: (e: Error) => void,
): CaptureHandle {
  const onError = (e: Error): void => {
    logger(`capture:${config.CAPTURE}`).error(e.message);
    onEnd?.(e);
  };
  return match(config.CAPTURE)
    .with('grpc', () => startGrpc({ serial, onChunk, onError }))
    .with('scrcpy', () =>
      startScrcpy({
        adbArgs,
        serverJar: config.SCRCPY_JAR,
        port: scrcpyPort++,
        control: config.SCRCPY_CONTROL,
        maxSize: config.MAX_SIZE,
        bitRate: config.BIT_RATE || 8_000_000,
        onChunk,
        onError,
      }),
    )
    .otherwise(() =>
      startScreenrecord({
        adbArgs,
        size: scaledSize(size.w, size.h, config.MAX_SIZE),
        bitRate: config.BIT_RATE || 4_000_000,
        onChunk,
        onError,
      }),
    );
}
