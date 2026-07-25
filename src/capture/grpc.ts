import { logger } from '../log.ts';
import { grpcEndpointFor } from '../grpc/discovery.ts';
import { createEmulatorClient } from '../grpc/emulatorClient.ts';
import type { CaptureHandle, EmulatorInput } from './types.ts';

const log = logger('grpc');
const PRESSURE_DOWN = 1; // any >0 registers contact; 0 lifts it

export interface GrpcOptions {
  serial: string;
  onChunk: (png: Buffer) => void;
  onError?: (e: Error) => void;
}

export function startGrpc({ serial, onChunk, onError }: GrpcOptions): CaptureHandle {
  const ep = grpcEndpointFor(serial);
  if (!ep) {
    throw new Error(
      `no emulator gRPC endpoint for ${serial}. gRPC capture is emulator-only, and the ` +
        `emulator must advertise a discovery file (pid_*.ini) with grpc.port/grpc.token.`,
    );
  }

  const client = createEmulatorClient(ep.port, ep.token);
  let streaming = true;
  const cancel = client.streamScreenshot(
    (png) => {
      if (streaming) onChunk(png);
    },
    (e) => {
      if (streaming) onError?.(e);
    },
  );
  log.debug(`streaming screenshots from ${serial} @ :${ep.port}`);

  const emulator: EmulatorInput = {
    touch(x, y, down, id = 0) {
      client.sendTouch(Math.round(x), Math.round(y), down ? PRESSURE_DOWN : 0, id);
    },
    keyDown(key) {
      client.sendKey({ eventType: 0, key });
    },
    keyUp(key) {
      client.sendKey({ eventType: 1, key });
    },
    text(value) {
      client.sendKey({ text: value });
    },
  };

  return {
    name: 'grpc',
    emulator,
    stop() {
      streaming = false;
      cancel();
      client.close();
    },
  };
}
