import { match } from 'ts-pattern';
import { config } from '../config.ts';
import { logger } from '../log.ts';
import { startScreenrecord } from './screenrecord.ts';
import { startScrcpy } from './scrcpy.ts';
import { startGrpc } from './grpc.ts';
import type { CaptureHandle } from './types.ts';

let scrcpyPort = 27183; // bumped per connection so reconnects don't collide

const onError = (e: Error): void => logger(`capture:${config.CAPTURE}`).error(e.message);

export function startCapture(
  serial: string,
  adbArgs: (...r: string[]) => string[],
  onChunk: (c: Buffer) => void,
): CaptureHandle {
  return match(config.CAPTURE)
    .with('grpc', () => startGrpc({ serial, onChunk, onError }))
    .with('scrcpy', () =>
      startScrcpy({
        adbArgs,
        serverJar: config.SCRCPY_JAR,
        port: scrcpyPort++,
        control: config.SCRCPY_CONTROL,
        onChunk,
        onError,
      }),
    )
    .otherwise(() => startScreenrecord({ adbArgs, onChunk, onError }));
}
