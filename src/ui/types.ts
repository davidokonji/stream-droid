export interface AvdStatus {
  name: string;
  running: boolean;
  serial: string | null;
  headless: boolean; // running windowless — its "close" fully kills the emulator
  booted: boolean | null; // running & framework up; false = still starting; null = stopped
  bootError: string | null; // why the last boot exited early (e.g. bad skin), else null
}
export interface DeviceInfo {
  serial: string;
  avd: string;
}
export interface State {
  avds: AvdStatus[];
  devices: DeviceInfo[];
  capture: string;
  target?: string; // preferred device: adb serial or AVD name (from the CLI)
}

export type Codec = 'h264' | 'png';

// Connection state of the streamed device, for the preview overlay.
export type ConnState = 'idle' | 'connecting' | 'live' | 'disconnected' | 'error';

export type ServerMsg =
  | { type: 'meta'; name?: string; w: number; h: number; codec?: Codec; control?: boolean }
  | { type: 'poster' } // next binary frame is a one-shot PNG preview (canvas)
  | { type: 'error'; message: string };

export type Control =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms?: number }
  | { type: 'longPress'; x: number; y: number; ms?: number }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { type: 'text'; value: string }
  | { type: 'key'; key: string };
