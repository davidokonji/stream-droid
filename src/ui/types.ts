export interface AvdStatus {
  name: string;
  running: boolean;
  serial: string | null;
  headless: boolean; // running windowless — its "close" fully kills the emulator
  emulator: boolean; // emulator (bootable/killable) vs a physical device (no shutdown)
  booted: boolean | null; // running & framework up; false = still starting; null = stopped
  bootError: string | null; // why the last boot exited early (e.g. bad skin), else null
}
export interface DeviceInfo {
  serial: string;
  avd: string;
}
export interface TunnelInfo {
  active: boolean;
  url: string | null; // public base URL while sharing
  control: boolean; // shared link carries the control token
  backend: string | null; // 'cloudflared' | 'localtunnel'
  host: boolean; // caller is the local operator — the share panel is host-only
  shareUrl: string | null; // the link to hand out (with ?k= in control mode); host-only
  qr: string | null; // SVG QR of shareUrl; host-only
}
export interface State {
  avds: AvdStatus[];
  devices: DeviceInfo[];
  capture: string;
  target?: string; // preferred device: adb serial or AVD name (from the CLI)
  host: boolean; // caller is the local operator — device management + sharing are host-only
  tunnel?: TunnelInfo; // present when the server reports share status
}

export interface BootOpts {
  headless?: boolean;
  cold?: boolean;
}

export type Codec = 'h264' | 'png';

// Connection state of the streamed device, for the preview overlay.
export type ConnState = 'idle' | 'connecting' | 'live' | 'disconnected' | 'error';

export type ServerMsg =
  | {
      type: 'meta';
      name?: string;
      w: number;
      h: number;
      codec?: Codec;
      control?: boolean;
      clipboard?: boolean;
    }
  | { type: 'poster' } // next binary frame is a one-shot PNG preview (canvas)
  | { type: 'clipboard'; value: string } // the device's clipboard changed
  | { type: 'error'; message: string };

export type Control =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms?: number }
  | { type: 'longPress'; x: number; y: number; ms?: number }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { type: 'text'; value: string }
  | { type: 'key'; key: string }
  | { type: 'paste'; value: string }
  | { type: 'copy' };
