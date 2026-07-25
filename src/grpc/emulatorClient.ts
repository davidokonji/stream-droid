// Thin wrapper over the Android Emulator's EmulatorController gRPC service.
// Loads the trimmed proto, authenticates with the discovery-file bearer token
// (metadata `authorization: Bearer <token>`, sufficient in the default token
// mode), and exposes just what we need: a PNG screenshot stream + input.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import type { ChannelCredentials, ClientReadableStream, Metadata, ServiceError } from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const PROTO = join(dirname(fileURLToPath(import.meta.url)), 'emulator_controller.proto');

// ImageFormat.ImgFormat / KeyboardEvent.KeyEventType enum values (see the proto).
const FORMAT_PNG = 0;
const KEY_DOWN = 0,
  KEY_PRESS = 2;

// The proto message shapes we send/receive (only the fields we use).
interface ImageFormatReq {
  format: number;
  width: number;
  height: number;
  display: number;
}
interface ImageMsg {
  image?: Buffer;
}
interface TouchMsg {
  x: number;
  y: number;
  identifier: number;
  pressure: number;
}
interface TouchEventReq {
  touches: TouchMsg[];
  display: number;
}
interface KeyboardEventReq {
  codeType: number;
  eventType: number;
  keyCode: number;
  key: string;
  text: string;
}
interface EmptyMsg {
  /* no fields */
}
type UnaryCb = (err: ServiceError | null, res: EmptyMsg) => void;
const ignore: UnaryCb = () => {
  /* fire-and-forget input */
};

// The subset of the generated EmulatorController client we call.
interface EmulatorControllerClient {
  streamScreenshot(req: ImageFormatReq, md: Metadata): ClientReadableStream<ImageMsg>;
  sendTouch(req: TouchEventReq, md: Metadata, cb: UnaryCb): void;
  sendKey(req: KeyboardEventReq, md: Metadata, cb: UnaryCb): void;
  close(): void;
}
type EmulatorControllerCtor = new (address: string, creds: ChannelCredentials) => EmulatorControllerClient;

let ServiceCtor: EmulatorControllerCtor | null = null;
function service(): EmulatorControllerCtor {
  if (ServiceCtor) return ServiceCtor;
  const def = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: Number,
    enums: Number,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as unknown as {
    android: { emulation: { control: { EmulatorController: EmulatorControllerCtor } } };
  };
  ServiceCtor = pkg.android.emulation.control.EmulatorController;
  return ServiceCtor;
}

export interface EmulatorClient {
  /** Stream server-encoded PNG frames; returns a cancel function. */
  streamScreenshot(onImage: (png: Buffer) => void, onError: (e: Error) => void): () => void;
  sendTouch(x: number, y: number, pressure: number, identifier: number): void;
  /** Set exactly one of key (W3C DOM key name) or text. */
  sendKey(fields: { eventType?: number; key?: string; text?: string }): void;
  close(): void;
}

export function createEmulatorClient(port: number, token: string): EmulatorClient {
  const client = new (service())(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const md = new grpc.Metadata();
  if (token) md.set('authorization', `Bearer ${token}`);

  return {
    streamScreenshot(onImage, onError) {
      const call = client.streamScreenshot({ format: FORMAT_PNG, width: 0, height: 0, display: 0 }, md);
      call.on('data', (img: ImageMsg) => {
        if (img.image?.length) onImage(Buffer.from(img.image));
      });
      call.on('error', (e: Error) => onError(e));
      return () => {
        try {
          call.cancel();
        } catch {
          /* already gone */
        }
      };
    },
    sendTouch(x, y, pressure, identifier) {
      client.sendTouch({ touches: [{ x, y, identifier, pressure }], display: 0 }, md, ignore);
    },
    sendKey({ eventType = KEY_DOWN, key = '', text = '' }) {
      client.sendKey(
        { codeType: 0, eventType: text ? KEY_PRESS : eventType, keyCode: 0, key, text },
        md,
        ignore,
      );
    },
    close() {
      client.close();
    },
  };
}
