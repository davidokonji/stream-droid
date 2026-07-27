// Emulator management: list AVDs, see which are running, and boot them —
// optionally headless (`-no-window`), so the emulator runs with no GUI on the
// host and is only reachable over adb (which is all stream-droid needs to
// capture + drive it).
//
// Note: AVDs are launched with the SDK `emulator` binary, not `adb`. `adb` only
// ever sees *running* devices; the `emulator` tool owns the AVD list and boot.

import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AvdStatus {
  name: string; // AVD name, e.g. "Pixel_9"
  running: boolean;
  serial: string | null; // adb serial when running, e.g. "emulator-5554"
  headless: boolean; // running windowless (-no-window) — its "close" fully kills it
}

export interface DeviceInfo {
  serial: string;
  avd: string; // AVD name if resolvable, else the serial
}

// Resolve the SDK `emulator` binary from the usual env/locations, or null if it
// can't be found (sidebar boot is then unavailable, but streaming still works).
function emulatorBin(): string | null {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(process.env.HOME ?? '', 'Library/Android/sdk');
  const candidates = [
    join(sdk, 'emulator', 'emulator'),
    join(process.env.HOME ?? '', 'Library/Android/sdk/emulator/emulator'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // Last resort: PATH.
  if (spawnSync('emulator', ['-help'], { stdio: 'ignore' }).error === undefined) return 'emulator';
  return null;
}

// True when the SDK `emulator` binary is available (gates AVD listing/booting).
export function hasEmulator(): boolean {
  return emulatorBin() !== null;
}

// True when `adb` is on PATH (gates everything).
export function hasAdb(): boolean {
  return spawnSync('adb', ['version'], { stdio: 'ignore' }).error === undefined;
}

const adb = (...rest: string[]): string => execFileSync('adb', rest, { encoding: 'utf8' }).trim();

// All AVDs known to the SDK.
export function listAvds(): string[] {
  const bin = emulatorBin();
  if (!bin) return [];
  try {
    return execFileSync(bin, ['-list-avds'], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Running adb devices, each mapped back to its AVD name where possible.
export function listDevices(): DeviceInfo[] {
  let out = '';
  try {
    out = adb('devices');
  } catch {
    return [];
  }
  const devices: DeviceInfo[] = [];
  for (const line of out.split('\n').slice(1)) {
    const [serial, state] = line.split('\t');
    if (!serial || state !== 'device') continue;
    let avd = serial;
    try {
      avd =
        execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], { encoding: 'utf8' })
          .split('\n')[0]!
          .trim() || serial;
    } catch {
      /* physical device / no console */
    }
    devices.push({ serial, avd });
  }
  return devices;
}

// AVDs this server process booted with -no-window. Cross-platform (no `ps`), but
// only same-session — the process scan below covers external/pre-restart boots.
const bootedHeadless = new Set<string>();

// AVD names whose emulator process was launched windowless — read from the process
// args (`-no-window`, or the `qemu-system-*-headless` binary), so it's correct even
// for emulators this server didn't boot. `ps` is macOS/Linux only. Cached briefly
// because /api/state is polled: a full process scan per request would stall the
// event loop.
let psCache: { at: number; set: Set<string> } = { at: 0, set: new Set() };
function psHeadlessAvds(): Set<string> {
  if (Date.now() - psCache.at < 2000) return psCache.set;
  const set = new Set<string>();
  try {
    const ps = execFileSync('ps', ['-ax', '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of ps.split('\n')) {
      // Emulator process lines carry `-avd <name>`; only those with -no-window (or
      // the headless qemu binary) are windowless — avoids matching unrelated procs.
      if (!/-no-window|qemu-system-\S*-headless/.test(line)) continue;
      const m = line.match(/-avd\s+([A-Za-z0-9._-]+)/);
      if (m) set.add(m[1]!);
    }
  } catch {
    /* ps unavailable (e.g. Windows) — rely on bootedHeadless only */
  }
  psCache = { at: Date.now(), set };
  return set;
}

// Last time each AVD was seen running, so the sidebar can surface the most
// recently used emulators first. In-memory (per server run).
const lastActive = new Map<string, number>();

// Join the AVD list with running state for the sidebar, ordered most-recently-active
// first: running emulators, then stopped ones by last-run recency, then the rest.
export function avdStatuses(): AvdStatus[] {
  const running = listDevices();
  const now = Date.now();
  for (const d of running) lastActive.set(d.avd, now);
  const bySerial = new Map(running.map((d) => [d.avd, d.serial] as const));
  const ps = running.length ? psHeadlessAvds() : new Set<string>();
  const names = new Set(listAvds());
  // Include any running AVD that -list-avds didn't report (e.g. ad-hoc).
  for (const d of running) names.add(d.avd);
  return [...names]
    .map((name) => ({
      name,
      running: bySerial.has(name),
      serial: bySerial.get(name) ?? null,
      // Windowless if either signal says so — process scan (cross-session, unix) or
      // this server's own headless boots (works everywhere, incl. Windows).
      headless: bySerial.has(name) && (bootedHeadless.has(name) || ps.has(name)),
    }))
    .toSorted((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1; // running first
      const diff = (lastActive.get(b.name) ?? 0) - (lastActive.get(a.name) ?? 0);
      return diff || a.name.localeCompare(b.name); // most-recent, then stable alpha
    });
}

// Boot an AVD. `headless` adds -no-window: no host GUI, adb-only — ideal for a
// machine that just streams to the browser. Detached so it outlives... nothing,
// but doesn't block the request; boot takes ~20–60s before adb sees it.
export function startEmulator(avd: string, opts: { headless?: boolean } = {}): { avd: string; pid?: number } {
  const bin = emulatorBin();
  if (!bin) {
    throw new Error(
      'SDK `emulator` not found. Install Android SDK emulator and set ANDROID_HOME ' +
        '(or add platform-tools/emulator to PATH).',
    );
  }
  if (!listAvds().includes(avd)) {
    throw new Error(`unknown AVD "${avd}". Known AVDs: ${listAvds().join(', ') || '(none)'}`);
  }
  const args = ['-avd', avd, '-no-boot-anim', '-no-snapshot-save'];
  if (opts.headless) {
    args.push('-no-window', '-no-audio');
    bootedHeadless.add(avd); // so "close" fully kills it even where `ps` is unavailable
  }
  const child = execFile(bin, args, { windowsHide: true }, () => {
    /* detached; ignore result */
  });
  child.unref();
  return { avd, pid: child.pid };
}

// Shut a running emulator down via `adb emu kill`. Emulators only — physical
// devices don't respond to this (the caller surfaces the error).
export function killEmulator(serial: string): void {
  execFileSync('adb', ['-s', serial, 'emu', 'kill']);
}
