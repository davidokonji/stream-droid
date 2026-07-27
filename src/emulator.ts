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

// AVD names whose emulator process was launched windowless — read from the process
// args (`-no-window`, or the `qemu-system-*-headless` binary), so it's correct no
// matter who booted it or whether the server restarted. `ps` is macOS/Linux; on a
// platform without it we treat all as windowed (best-effort).
function headlessAvds(): Set<string> {
  const set = new Set<string>();
  try {
    const ps = execFileSync('ps', ['-ax', '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of ps.split('\n')) {
      if (!/-no-window|qemu-system-\S*-headless/.test(line)) continue;
      const m = line.match(/-avd\s+([A-Za-z0-9._-]+)/);
      if (m) set.add(m[1]!);
    }
  } catch {
    /* ps unavailable (e.g. Windows) — treat as none */
  }
  return set;
}

// Join the AVD list with running state for the sidebar.
export function avdStatuses(): AvdStatus[] {
  const running = listDevices();
  const bySerial = new Map(running.map((d) => [d.avd, d.serial] as const));
  const headless = running.length ? headlessAvds() : new Set<string>();
  const names = new Set(listAvds());
  // Include any running AVD that -list-avds didn't report (e.g. ad-hoc).
  for (const d of running) names.add(d.avd);
  return [...names].toSorted().map((name) => ({
    name,
    running: bySerial.has(name),
    serial: bySerial.get(name) ?? null,
    headless: bySerial.has(name) && headless.has(name),
  }));
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
  if (opts.headless) args.push('-no-window', '-no-audio');
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
