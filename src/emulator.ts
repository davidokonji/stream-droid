import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AvdStatus {
  name: string; // AVD name, e.g. "Pixel_9"
  running: boolean;
  serial: string | null; // adb serial when running, e.g. "emulator-5554"
  headless: boolean;
  emulator: boolean;
  booted: boolean | null;
  bootError: string | null;
}

export interface DeviceInfo {
  serial: string;
  avd: string; // AVD name if resolvable, else the serial
}

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
  if (spawnSync('emulator', ['-help'], { stdio: 'ignore' }).error === undefined) return 'emulator';
  return null;
}

export function hasEmulator(): boolean {
  return emulatorBin() !== null;
}

export function hasAdb(): boolean {
  return spawnSync('adb', ['version'], { stdio: 'ignore' }).error === undefined;
}

export function accelStatus(): { ok: boolean; detail: string } {
  const bin = emulatorBin();
  if (!bin) return { ok: false, detail: 'SDK `emulator` not found' };
  const r = spawnSync(bin, ['-accel-check'], { encoding: 'utf8' });

  const lines = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const detail =
    lines.find((l) => !/^accel:?$/i.test(l) && !/^-?\d+$/.test(l)) ??
    (r.status === 0 ? 'accel available' : 'accel unavailable');
  return { ok: r.status === 0, detail };
}

export function deviceBooted(serial: string): boolean {
  try {
    const out = execFileSync('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '1';
  } catch {
    return false; // console/framework not reachable yet
  }
}

let bootCache: { at: number; map: Map<string, boolean> } = { at: 0, map: new Map() };
function bootedSerials(running: DeviceInfo[]): Map<string, boolean> {
  if (Date.now() - bootCache.at < 2000) return bootCache.map;
  const map = new Map<string, boolean>();
  for (const d of running) map.set(d.serial, deviceBooted(d.serial));
  bootCache = { at: Date.now(), map };
  return map;
}

const adb = (...rest: string[]): string => execFileSync('adb', rest, { encoding: 'utf8' }).trim();

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

// Physical device model name, cached by serial (stable) so it isn't re-shelled on
// every /api/state poll. Falls back to the serial when unreadable.
const modelCache = new Map<string, string>();
function physicalModel(serial: string): string {
  const cached = modelCache.get(serial);
  if (cached) return cached;
  try {
    const model = execFileSync('adb', ['-s', serial, 'shell', 'getprop', 'ro.product.model'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (model) {
      modelCache.set(serial, model);
      return model;
    }
  } catch {
    /* property unreadable — fall back to the serial */
  }
  return serial;
}

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
        execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split('\n')[0]!
          .trim() || serial;
    } catch {
      avd = physicalModel(serial); // no emulator console — a physical device
    }
    devices.push({ serial, avd });
  }
  // avdStatuses keys by name, so two same-model devices ("Pixel 7") would collapse
  // to one row — disambiguate duplicates with a serial suffix.
  const counts = new Map<string, number>();
  for (const d of devices) counts.set(d.avd, (counts.get(d.avd) ?? 0) + 1);
  for (const d of devices) {
    if ((counts.get(d.avd) ?? 0) > 1 && d.avd !== d.serial) d.avd = `${d.avd} (${d.serial.slice(-4)})`;
  }
  return devices;
}

const bootedHeadless = new Set<string>();

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

const lastActive = new Map<string, number>();

export function avdStatuses(): AvdStatus[] {
  const running = listDevices();
  const now = Date.now();
  for (const d of running) {
    lastActive.set(d.avd, now);
    bootErrors.delete(d.avd); // it's up — no longer a failed boot
  }
  const bySerial = new Map(running.map((d) => [d.avd, d.serial] as const));
  const ps = running.length ? psHeadlessAvds() : new Set<string>();
  const booted = running.length ? bootedSerials(running) : new Map<string, boolean>();
  const names = new Set(listAvds());
  // Include any running AVD that -list-avds didn't report (e.g. ad-hoc).
  for (const d of running) names.add(d.avd);
  return [...names]
    .map((name) => ({
      name,
      running: bySerial.has(name),
      serial: bySerial.get(name) ?? null,
      headless: bySerial.has(name) && (bootedHeadless.has(name) || ps.has(name)),
      // Running via an `emulator-NNNN` serial ⇒ an emulator; stopped AVDs (from
      // -list-avds) are emulators too. A physical device's serial is anything else.
      emulator: bySerial.has(name) ? (bySerial.get(name) ?? '').startsWith('emulator-') : true,
      booted: bySerial.has(name) ? (booted.get(bySerial.get(name)!) ?? false) : null,
      bootError: bySerial.has(name) ? null : (bootErrors.get(name) ?? null),
    }))
    .toSorted((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1; // running first
      const diff = (lastActive.get(b.name) ?? 0) - (lastActive.get(a.name) ?? 0);
      return diff || a.name.localeCompare(b.name); // most-recent, then stable alpha
    });
}

const bootErrors = new Map<string, string>();

const BOOT_FAIL_WINDOW_MS = 180_000;

function bootFailReason(log: string, code: number | null): string {
  const line = log
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => /^(ERROR\b|PANIC[:\s])/i.test(l));
  if (line) {
    return line
      .replace(/^ERROR\s*\|?\s*/i, '')
      .replace(/^PANIC:?\s*/i, 'panic: ')
      .trim();
  }
  return code ? `emulator exited (code ${code})` : ''; // clean exit / killed → not a failure
}

export function startEmulator(
  avd: string,
  opts: { headless?: boolean; cold?: boolean } = {},
): { avd: string; pid?: number } {
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
  if (opts.cold) args.push('-no-snapshot-load');
  if (opts.headless) {
    args.push('-no-window', '-no-audio');
    bootedHeadless.add(avd); // so "close" fully kills it even where `ps` is unavailable
  }
  bootErrors.delete(avd); // fresh attempt — drop any prior failure
  const startedAt = Date.now();
  const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep only the tail of the startup output; on an early exit it holds the reason.
  let tail = '';
  const capture = (buf: Buffer): void => {
    tail = `${tail}${buf}`.split('\n').slice(-12).join('\n');
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  child.on('error', () => {
    /* spawn failure — bin was already validated above; nothing to capture */
  });
  child.on('exit', (code) => {
    if (Date.now() - startedAt < BOOT_FAIL_WINDOW_MS) {
      const reason = bootFailReason(tail, code);
      if (reason) bootErrors.set(avd, reason);
    }
  });
  child.unref();
  return { avd, pid: child.pid };
}

export function killEmulator(serial: string): void {
  execFileSync('adb', ['-s', serial, 'emu', 'kill']);
}

export function killHeadlessBooted(): void {
  if (bootedHeadless.size === 0) return;
  let running: DeviceInfo[];
  try {
    running = listDevices();
  } catch {
    return;
  }
  for (const { serial, avd } of running) {
    const name = avd.replace(/\s+\(\w{4}\)$/, ''); // strip the duplicate-model suffix
    if (serial.startsWith('emulator-') && bootedHeadless.has(name)) {
      try {
        killEmulator(serial);
      } catch {
        /* best-effort cleanup on the way out */
      }
    }
  }
}
