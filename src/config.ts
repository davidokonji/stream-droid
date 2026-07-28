// Parsed CLI/env configuration + a couple of shared helpers, computed once at
// import so every module reads the same `config` singleton.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const argv = process.argv.slice(2);
const getArg = (flag: string, fallback: string): string => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const hasFlag = (...flags: string[]): boolean => flags.some((f) => argv.includes(f));

// Flags that consume the following token as a value (so it isn't a positional).
const VALUE_FLAGS = new Set([
  '--port',
  '--serial',
  '--emulator',
  '--avd',
  '--capture',
  '--scrcpy-server',
  '--scrcpy-control',
  '--max-size',
  '--bit-rate',
  '--kill',
  '--tunnel-backend',
  '--host',
]);

// Parse a bit-rate like "4000000", "3M", or "800K" → bits/sec (0 if unset/invalid).
function parseBitRate(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([kKmM]?)$/.exec(s.trim());
  if (!m) return 0;
  const unit = m[2]!.toLowerCase();
  return Math.round(Number(m[1]) * (unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1));
}
// Bare (non-flag) arguments, e.g. the emulator name in `stream-droid Pixel_9`.
function positionals(): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    } // skip flag + its value
    if (a.startsWith('-')) continue; // boolean flag
    out.push(a);
  }
  return out;
}

export type Mode = 'help' | 'list' | 'kill' | 'log' | 'serve';
export type Codec = 'h264' | 'png';

const TUNNEL_CONTROL = hasFlag('-tc', '--tunnel-control'); // share a CONTROLLABLE public link
const TUNNEL = hasFlag('-t', '--tunnel') || TUNNEL_CONTROL; // public link + QR
const SECURE = TUNNEL; // gate control behind a token while tunneling
const CAPTURE = getArg('--capture', process.env.CAPTURE ?? 'screenrecord'); // screenrecord | scrcpy | grpc
const HELP = hasFlag('-h', '--help');
const LIST = hasFlag('-a', '--list');
const LOG = hasFlag('-l', '--log', '--logcat');
// Target device: an adb serial OR an AVD name, from a flag/env or the first bare arg.
const TARGET = getArg(
  '--serial',
  getArg('--emulator', getArg('--avd', process.env.ANDROID_SERIAL ?? positionals()[0] ?? '')),
);
// --kill [name]: uses the flag's value if given, else the positional/target.
const KILL = (() => {
  if (!hasFlag('--kill')) return '';
  const v = getArg('--kill', '');
  return v && !v.startsWith('-') ? v : TARGET;
})();

const HERE = dirname(fileURLToPath(import.meta.url)); // src/

export const config = {
  PORT: Number(getArg('--port', process.env.PORT ?? '3200')),
  HOST: getArg('--host', process.env.STREAM_DROID_HOST ?? '127.0.0.1'),
  TARGET,
  CAPTURE,
  CODEC: (CAPTURE === 'grpc' ? 'png' : 'h264') as Codec, // gRPC → PNG frames, else H.264
  SCRCPY_JAR: getArg('--scrcpy-server', process.env.SCRCPY_SERVER_JAR ?? ''),
  SCRCPY_CONTROL: getArg('--scrcpy-control', process.env.SCRCPY_CONTROL ?? 'on') !== 'off',
  MAX_SIZE: Number(getArg('--max-size', process.env.STREAM_DROID_MAX_SIZE ?? '0')) || 0,
  BIT_RATE: parseBitRate(getArg('--bit-rate', process.env.STREAM_DROID_BIT_RATE ?? '0')),
  // Headless server: don't auto-open the browser (the app still serves).
  HEADLESS: hasFlag('-d', '--headless') || process.env.STREAM_DROID_HEADLESS === '1',
  // Verbose: print debug logs (per request / frame / control) + timestamps.
  VERBOSE: hasFlag('-v', '--verbose') || process.env.STREAM_DROID_VERBOSE === '1',
  LIST,
  LOG,
  KILL,
  TUNNEL,
  TUNNEL_CONTROL,
  TUNNEL_BACKEND: getArg('--tunnel-backend', process.env.STREAM_DROID_TUNNEL_BACKEND ?? 'auto'),
  SECURE,
  CONTROL_TOKEN: SECURE ? randomBytes(16).toString('hex') : '',
  mode: (HELP ? 'help' : LIST ? 'list' : KILL ? 'kill' : LOG ? 'log' : 'serve') as Mode,
  ROOT: join(HERE, '..'),
  PUBLIC: join(HERE, '..', 'public'),
};

// Does the `k` query carry the control token? (Meaningful only in tunnel mode.)
export function isAuthorized(reqUrl: string | undefined): boolean {
  if (!config.SECURE) return true;
  return new URL(reqUrl ?? '/', 'http://localhost').searchParams.get('k') === config.CONTROL_TOKEN;
}

export function ensureControlToken(): string {
  if (!config.CONTROL_TOKEN) {
    config.CONTROL_TOKEN = randomBytes(16).toString('hex');
    config.SECURE = true;
  }
  return config.CONTROL_TOKEN;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// A request is remote if it came over the relay (forwarding header) or from a
// non-loopback address; a local operator request is neither.
export function isRemote(req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }): boolean {
  const h = req.headers;
  return (
    Boolean(h['x-forwarded-for'] || h['cf-connecting-ip']) || !LOOPBACK.has(req.socket.remoteAddress ?? '')
  );
}

export function canControl(req: {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
  url?: string;
}): boolean {
  return !isRemote(req) || isAuthorized(req.url);
}

// Print an actionable error and exit.
export function fail(msg: string, hint: string): never {
  console.error(`[stream-droid] ✗ ${msg}\n  → ${hint}`);
  process.exit(1);
}
