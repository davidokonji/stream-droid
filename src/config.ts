// Parsed CLI/env configuration + a couple of shared helpers, computed once at
// import so every module reads the same `config` singleton.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

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
  '--kill',
]);
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
  TARGET,
  CAPTURE,
  CODEC: (CAPTURE === 'grpc' ? 'png' : 'h264') as Codec, // gRPC → PNG frames, else H.264
  SCRCPY_JAR: getArg('--scrcpy-server', process.env.SCRCPY_SERVER_JAR ?? ''),
  SCRCPY_CONTROL: getArg('--scrcpy-control', process.env.SCRCPY_CONTROL ?? 'on') !== 'off',
  // Headless server: don't auto-open the browser (the app still serves).
  HEADLESS: hasFlag('-d', '--headless') || process.env.STREAM_DROID_HEADLESS === '1',
  // Verbose: print debug logs (per request / frame / control) + timestamps.
  VERBOSE: hasFlag('-v', '--verbose') || process.env.STREAM_DROID_VERBOSE === '1',
  LIST,
  LOG,
  KILL,
  TUNNEL,
  TUNNEL_CONTROL,
  SECURE,
  CONTROL_TOKEN: SECURE ? randomBytes(16).toString('hex') : '',
  mode: (HELP ? 'help' : LIST ? 'list' : KILL ? 'kill' : LOG ? 'log' : 'serve') as Mode,
  ROOT: join(HERE, '..'),
  PUBLIC: join(HERE, '..', 'public'),
};

// May a request/connection control the device? Always yes unless a control token
// is in force (tunnel mode), in which case the `k` query must match.
export function isAuthorized(reqUrl: string | undefined): boolean {
  if (!config.SECURE) return true;
  return new URL(reqUrl ?? '/', 'http://localhost').searchParams.get('k') === config.CONTROL_TOKEN;
}

// Print an actionable error and exit.
export function fail(msg: string, hint: string): never {
  console.error(`[stream-droid] ✗ ${msg}\n  → ${hint}`);
  process.exit(1);
}
