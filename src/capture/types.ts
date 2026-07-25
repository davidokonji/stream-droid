export interface CaptureMeta {
  name: string;
  w: number;
  h: number;
}

// Direct device input exposed by the gRPC backend (emulator only). Coordinates
// are device pixels; keys are W3C DOM key names ("Enter", "GoBack", …).
export interface EmulatorInput {
  touch(x: number, y: number, down: boolean, id?: number): void;
  keyDown(key: string): void;
  keyUp(key: string): void;
  text(value: string): void;
}

export interface CaptureHandle {
  readonly name: string;
  stop(): void;
  // Low-latency control channel (scrcpy's control socket). `writeControl` sends a
  // pre-encoded scrcpy control message; `controlReady` reports whether the socket
  // is connected yet, so callers fall back to `adb input` until it is (or if it
  // never connects). Both absent for backends without a control socket.
  writeControl?: (buf: Buffer) => void;
  controlReady?: () => boolean;
  // Present only for the gRPC backend — input via EmulatorController RPCs.
  emulator?: EmulatorInput;
}

export interface CaptureOptions {
  adbArgs: (...rest: string[]) => string[];
  onChunk: (chunk: Buffer) => void;
  onError?: (err: Error) => void;
}

export interface ScrcpyOptions extends CaptureOptions {
  serverJar: string;
  port?: number;
  // Open scrcpy's control socket for low-latency input injection (client→server
  // binary control messages) instead of routing input through `adb input`.
  control?: boolean;
}
