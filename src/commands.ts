// Standalone CLI commands (run instead of, or alongside, the server):
// -a list, --kill, -l logcat, and --tunnel.

import { spawn, execFileSync } from 'node:child_process';
import { config, fail } from './config.ts';
import { adbFor } from './adb.ts';
import { hasAdb, listAvds, listDevices } from './emulator.ts';
import { openTunnel } from './tunnel.ts';

export function requireAdb(): void {
  if (!hasAdb()) fail('`adb` not found on PATH.', 'Install Android platform-tools and add it to PATH.');
}

// -h / --help: usage, then exit.
export function printHelp(): void {
  console.log(`stream-droid — stream an Android emulator/device to the browser and drive it.

Usage:
  stream-droid [name] [options]

  name                       emulator/AVD name or adb serial to stream (boots it if stopped)

Commands (run and exit):
  -a, --list                 list running streams and stopped AVDs
      --kill [name]          shut down a running emulator (emulators only)
  -l, --log, --logcat        stream the device's logcat, colourised by level
  -h, --help                 show this help

Options:
      --port <n>             HTTP + WS port (default 3200)
      --serial <s>           device to stream — adb serial or AVD name
                             (aliases: --emulator, --avd)
      --capture <mode>       screenrecord (default) | scrcpy | grpc (emulator-only)
      --max-size <px>        downscale capture so its longer edge ≤ px (h264 backends; 0 = native)
      --bit-rate <n>         encoder bit-rate, e.g. 4000000, 3M, 800K (h264 backends)
      --scrcpy-server <path> scrcpy-server v4.1 jar (optional — auto-downloads if omitted)
      --scrcpy-control <v>   on (default) | off — off routes input via \`adb input\`
  -d, --headless             don't auto-open the browser (server still runs)
  -v, --verbose              print debug logs (frames, control) + timestamps
  -t, --tunnel               expose a public link + console QR (view-only)
  -tc, --tunnel-control      tunnel with a controllable shared link
      --tunnel-backend <b>   cloudflared | localtunnel | auto (default: cloudflared if installed).
                             cloudflared has no visitor reminder page; localtunnel needs no install.

Env: PORT · ANDROID_SERIAL · CAPTURE · SCRCPY_SERVER_JAR · SCRCPY_CONTROL ·
     STREAM_DROID_HEADLESS · STREAM_DROID_VERBOSE

Examples:
  stream-droid                       # stream the running emulator, open the browser
  stream-droid Pixel_9 --headless    # boot + stream Pixel_9, no browser
  stream-droid --capture scrcpy      # v4.1 jar auto-downloads on first use
  stream-droid --tunnel-control      # share a controllable public link + QR`);
}

// -a / --list: running streams (devices), plus any stopped AVDs.
export function cmdListStreams(): void {
  const devs = listDevices();
  console.log(devs.length ? `Running streams (${devs.length}):` : 'No running streams.');
  for (const d of devs) {
    const kind = d.serial.startsWith('emulator-') ? 'emulator' : 'device';
    console.log(`  ${d.serial.padEnd(16)} ${d.avd.padEnd(24)} ${kind}`);
  }
  const up = new Set(devs.map((d) => d.avd));
  const stopped = listAvds().filter((a) => !up.has(a));
  if (stopped.length) console.log(`Stopped AVDs: ${stopped.join(', ')}`);
}

// --kill [name]: shut down a running emulator (emulators only).
export function cmdKill(name: string): never {
  const t = name.toLowerCase();
  const dev = listDevices().find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t);
  if (!dev) fail(`no running emulator matching "${name}".`, 'Run with -a to list running streams.');
  try {
    execFileSync('adb', ['-s', dev.serial, 'emu', 'kill']);
  } catch (e) {
    fail(`could not kill ${dev.serial}: ${(e as Error).message}`, 'Only emulators can be killed this way.');
  }
  console.log(`[stream-droid] killed ${dev.avd} (${dev.serial})`);
  process.exit(0);
}

// -l / --log: stream the device's logcat, colourised by level.
const LEVEL_COLOR: Record<string, string> = {
  V: '\x1b[90m',
  D: '\x1b[34m',
  I: '\x1b[32m',
  W: '\x1b[33m',
  E: '\x1b[31m',
  F: '\x1b[35m',
};
export function cmdLog(serial: string): void {
  const RESET = '\x1b[0m',
    DIM = '\x1b[2m';
  console.log(`[stream-droid] logcat ${serial} — Ctrl-C to stop\n`);
  const child = spawn('adb', adbFor(serial)('logcat', '-v', 'brief'), {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const re = /^([VDIWEF])\/(.+?)\(\s*(\d+)\):\s?(.*)$/;
  let buf = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const l of lines) {
      const m = re.exec(l);
      if (m) {
        const c = LEVEL_COLOR[m[1]!] ?? '';
        console.log(`${c}${m[1]}${RESET} ${DIM}${m[2]!.trim()}${RESET} ${c}${m[4]}${RESET}`);
      } else if (l.trim()) {
        console.log(`${DIM}${l}${RESET}`);
      }
    }
  });
  child.on('error', (e) => fail(`logcat failed: ${e.message}`, 'Is the device connected?'));
  child.on('exit', () => process.exit(0));
}

// --tunnel: expose the local server via a public URL + a console QR code.
// The shared link is view-only unless --tunnel-control adds the control token.
// The tunnel handle lives in tunnel.ts so it can be stopped later (browser
// "Stop sharing" button / `drive tunnel stop`) without killing the server.
export async function startTunnel(port: number): Promise<void> {
  try {
    const qr = await import('qrcode');
    const { shareUrl } = await openTunnel(port);
    if (!shareUrl) return;
    console.log(
      `\n[stream-droid] public link (${config.TUNNEL_CONTROL ? 'full control' : 'view-only'}): ${shareUrl}`,
    );
    console.log('[stream-droid] scan to open the session on another device:\n');
    console.log(await qr.toString(shareUrl, { type: 'terminal', small: true }));
    if (!config.TUNNEL_CONTROL) {
      console.log('[stream-droid] viewers can watch but not drive — use --tunnel-control to share control.');
    }
    console.log(
      '[stream-droid] stop sharing anytime: the browser “Stop sharing” button, or `drive tunnel stop`.',
    );
  } catch (e) {
    console.error('[stream-droid] tunnel failed:', (e as Error).message);
  }
}
