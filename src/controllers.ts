// Input injection. Clients speak in normalized [0..1] coordinates; each
// controller scales to device pixels and drives the device a different way:
// `adb input` (universal), scrcpy's control socket (low latency), or the
// emulator gRPC RPCs. `pickController` chooses one per capture handle.

import { spawn } from 'node:child_process';
import { match, P } from 'ts-pattern';
import { logger } from './log.ts';
import * as sc from './capture/scrcpyControl.ts';
import type { CaptureHandle, CaptureMeta, EmulatorInput } from './capture/types.ts';

const log = logger('input');

export type Control =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; ms?: number }
  | { type: 'text'; value: string }
  | { type: 'key'; key: string };

export type Controller = (msg: Control) => void;

// Messages a client may send over the WebSocket: raw controls, the semantic
// `tapElement` (resolved to a tap server-side), and the `longPress`/`scroll`
// gestures (translated to a swipe server-side — see wsServer.ts).
export type Incoming =
  | Control
  | { type: 'tapElement'; id?: string; text?: string }
  | { type: 'longPress'; x: number; y: number; ms?: number }
  | { type: 'scroll'; x: number; y: number; dx: number; dy: number };

// adb-input backend: shells out per event. `input` names keys as strings.
const ADB_KEYCODES: Record<string, string> = {
  Enter: 'KEYCODE_ENTER',
  Backspace: 'KEYCODE_DEL',
  Tab: 'KEYCODE_TAB',
  ArrowUp: 'KEYCODE_DPAD_UP',
  ArrowDown: 'KEYCODE_DPAD_DOWN',
  ArrowLeft: 'KEYCODE_DPAD_LEFT',
  ArrowRight: 'KEYCODE_DPAD_RIGHT',
  Home: 'KEYCODE_HOME',
  Back: 'KEYCODE_BACK',
  AppSwitch: 'KEYCODE_APP_SWITCH',
  DpadCenter: 'KEYCODE_DPAD_CENTER',
  VolumeUp: 'KEYCODE_VOLUME_UP',
  VolumeDown: 'KEYCODE_VOLUME_DOWN',
  VolumeMute: 'KEYCODE_VOLUME_MUTE',
  Power: 'KEYCODE_POWER',
  Camera: 'KEYCODE_CAMERA',
  Menu: 'KEYCODE_MENU',
  Notifications: 'KEYCODE_NOTIFICATION',
  Search: 'KEYCODE_SEARCH',
  MediaPlayPause: 'KEYCODE_MEDIA_PLAY_PAUSE',
  MediaNext: 'KEYCODE_MEDIA_NEXT',
  MediaPrevious: 'KEYCODE_MEDIA_PREVIOUS',
  PageUp: 'KEYCODE_PAGE_UP',
  PageDown: 'KEYCODE_PAGE_DOWN',
  Escape: 'KEYCODE_ESCAPE',
  Delete: 'KEYCODE_FORWARD_DEL',
};

function adbController(size: CaptureMeta, adbArgs: (...r: string[]) => string[]): Controller {
  const px = (nx: number, ny: number): [number, number] => [Math.round(nx * size.w), Math.round(ny * size.h)];
  const input = (...rest: string[]) =>
    spawn('adb', adbArgs('shell', 'input', ...rest), { stdio: 'ignore' }).on('error', (e: Error) =>
      log.error(e.message),
    );

  return (msg) =>
    match(msg)
      .with({ type: 'tap' }, (m) => {
        const [x, y] = px(m.x, m.y);
        input('tap', String(x), String(y));
      })
      .with({ type: 'swipe' }, (m) => {
        const [x1, y1] = px(m.x1, m.y1);
        const [x2, y2] = px(m.x2, m.y2);
        input('swipe', `${x1}`, `${y1}`, `${x2}`, `${y2}`, String(m.ms ?? 200));
      })
      // `input text` escapes spaces as %s and is picky with punctuation.
      .with({ type: 'text' }, (m) => {
        if (m.value) input('text', m.value.replace(/ /g, '%s'));
      })
      .with({ type: 'key' }, (m) => {
        if (ADB_KEYCODES[m.key]) input('keyevent', ADB_KEYCODES[m.key]!);
      })
      .exhaustive();
}

// scrcpy-control backend: writes binary control messages straight to the socket
// — no per-event process spawn, so noticeably lower input latency. Until the
// control socket is connected (its first ~200ms, or permanently if it never
// connects), `ready()` is false and input is routed through `adb input` instead,
// so taps/keys are never silently dropped.
function scrcpyController(
  size: CaptureMeta,
  write: (b: Buffer) => void,
  ready: () => boolean,
  adbArgs: (...r: string[]) => string[],
): Controller {
  const w = size.w,
    h = size.h;
  const px = (nx: number, ny: number): [number, number] => [nx * w, ny * h];
  const fallback = adbController(size, adbArgs);

  const encode: Controller = (msg) =>
    match(msg)
      .with({ type: 'tap' }, (m) => {
        const [x, y] = px(m.x, m.y);
        write(sc.touch(sc.ACTION_DOWN, x, y, w, h, true));
        write(sc.touch(sc.ACTION_UP, x, y, w, h, false));
      })
      // scrcpy touch is discrete events, so synthesize DOWN → MOVEs → UP over
      // the requested duration for Android to read it as a drag/fling.
      .with({ type: 'swipe' }, (m) => {
        const [x1, y1] = px(m.x1, m.y1);
        const [x2, y2] = px(m.x2, m.y2);
        const ms = m.ms ?? 200,
          steps = 8;
        write(sc.touch(sc.ACTION_DOWN, x1, y1, w, h, true));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          setTimeout(
            () => write(sc.touch(sc.ACTION_MOVE, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w, h, true)),
            Math.round(ms * t),
          );
        }
        setTimeout(() => write(sc.touch(sc.ACTION_UP, x2, y2, w, h, false)), ms + 10);
      })
      .with({ type: 'text' }, (m) => {
        if (m.value) write(sc.text(m.value));
      })
      .with({ type: 'key' }, (m) => {
        const code = sc.KEYCODES[m.key];
        if (code !== undefined) {
          write(sc.keycode(sc.ACTION_DOWN, code));
          write(sc.keycode(sc.ACTION_UP, code));
        }
      })
      .exhaustive();

  return (msg) => (ready() ? encode(msg) : fallback(msg));
}

// gRPC-input backend: EmulatorController RPCs, device-pixel coordinates and W3C
// DOM key names.
const GRPC_KEYS: Record<string, string> = {
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'GoHome',
  Back: 'GoBack',
  AppSwitch: 'AppSwitch',
};

function grpcController(
  size: CaptureMeta,
  emu: EmulatorInput,
  adbArgs: (...r: string[]) => string[],
): Controller {
  const px = (nx: number, ny: number): [number, number] => [nx * size.w, ny * size.h];
  return (msg) =>
    match(msg)
      .with({ type: 'tap' }, (m) => {
        const [x, y] = px(m.x, m.y);
        emu.touch(x, y, true);
        emu.touch(x, y, false);
      })
      .with({ type: 'swipe' }, (m) => {
        const [x1, y1] = px(m.x1, m.y1);
        const [x2, y2] = px(m.x2, m.y2);
        const ms = m.ms ?? 200,
          steps = 8;
        emu.touch(x1, y1, true);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          setTimeout(() => emu.touch(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, true), Math.round(ms * t));
        }
        setTimeout(() => emu.touch(x2, y2, false), ms + 10);
      })
      .with({ type: 'text' }, (m) => {
        if (m.value) emu.text(m.value);
      })
      .with({ type: 'key' }, (m) => {
        const k = GRPC_KEYS[m.key];
        if (k) {
          emu.keyDown(k);
          emu.keyUp(k);
          return;
        }
        // Keys without a gRPC DOM-name mapping (volume, power, media, …) fall
        // back to `adb input keyevent`, which is always available.
        const code = ADB_KEYCODES[m.key];
        if (code) {
          spawn('adb', adbArgs('shell', 'input', 'keyevent', code), { stdio: 'ignore' }).on(
            'error',
            (e: Error) => log.error(e.message),
          );
        }
      })
      .exhaustive();
}

// Pick the input path for a capture handle: gRPC RPCs > scrcpy socket > adb input.
export function pickController(
  capture: CaptureHandle,
  size: CaptureMeta,
  adbArgs: (...r: string[]) => string[],
): { control: Controller; via: string } {
  const control = match(capture)
    .with({ emulator: P.nonNullable }, (c) => grpcController(size, c.emulator, adbArgs))
    .with({ writeControl: P.nonNullable }, (c) =>
      scrcpyController(size, c.writeControl, c.controlReady ?? (() => true), adbArgs),
    )
    .otherwise(() => adbController(size, adbArgs));
  const via = match(capture)
    .with({ emulator: P.nonNullable }, () => 'gRPC')
    .with({ writeControl: P.nonNullable }, () => 'scrcpy control socket')
    .otherwise(() => 'adb input');
  return { control, via };
}
