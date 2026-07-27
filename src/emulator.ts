// Emulator management: list AVDs, see which are running, and boot them —
// optionally headless (`-no-window`), so the emulator runs with no GUI on the
// host and is only reachable over adb (which is all stream-droid needs to
// capture + drive it).
//
// Note: AVDs are launched with the SDK `emulator` binary, not `adb`. `adb` only
// ever sees *running* devices; the `emulator` tool owns the AVD list and boot.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AvdStatus {
  name: string; // AVD name, e.g. "Pixel_9"
  running: boolean;
  serial: string | null; // adb serial when running, e.g. "emulator-5554"
  headless: boolean; // running windowless (-no-window) — its "close" fully kills it
  // Framework health when running: `device` in adb doesn't mean Android is up.
  // true = sys.boot_completed (ready), false = online but still starting, null = not running.
  booted: boolean | null;
  // Why the last boot attempt exited early (e.g. "unknown skin name '…'"), or null.
  // Lets a caller explain a crash-on-boot instead of just timing out; cleared on reboot.
  bootError: string | null;
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

// `emulator -accel-check` — is hardware acceleration usable? A global signal: if
// this fails, no AVD will boot healthily. Returns a one-line reason either way.
export function accelStatus(): { ok: boolean; detail: string } {
  const bin = emulatorBin();
  if (!bin) return { ok: false, detail: 'SDK `emulator` not found' };
  const r = spawnSync(bin, ['-accel-check'], { encoding: 'utf8' });
  // Output is `accel:` / <code> / <human description> / `accel` — pick the
  // description line (skip the `accel:`/`accel` markers and the bare status code).
  const lines = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const detail =
    lines.find((l) => !/^accel:?$/i.test(l) && !/^-?\d+$/.test(l)) ??
    (r.status === 0 ? 'accel available' : 'accel unavailable');
  return { ok: r.status === 0, detail };
}

// A running device's framework health: `device` in adb precedes Android being up,
// so check sys.boot_completed. true = ready to stream, false = online but starting.
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

// Cached boot-completed per running serial — /api/state is polled every 3 s, so a
// getprop per device per request would add up. Short TTL like the headless scan.
let bootCache: { at: number; map: Map<string, boolean> } = { at: 0, map: new Map() };
function bootedSerials(running: DeviceInfo[]): Map<string, boolean> {
  if (Date.now() - bootCache.at < 2000) return bootCache.map;
  const map = new Map<string, boolean>();
  for (const d of running) map.set(d.serial, deviceBooted(d.serial));
  bootCache = { at: Date.now(), map };
  return map;
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
      // stderr → 'ignore': a booting/shutting-down emulator's console isn't always
      // reachable, and we fall back to the serial anyway — no need to spew adb's
      // error to our terminal every poll.
      avd =
        execFileSync('adb', ['-s', serial, 'emu', 'avd', 'name'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
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
      // Windowless if either signal says so — process scan (cross-session, unix) or
      // this server's own headless boots (works everywhere, incl. Windows).
      headless: bySerial.has(name) && (bootedHeadless.has(name) || ps.has(name)),
      // Framework health while running; null when stopped (unknowable without booting).
      booted: bySerial.has(name) ? (booted.get(bySerial.get(name)!) ?? false) : null,
      // Why this AVD's last boot failed, if it did and it isn't running now.
      bootError: bySerial.has(name) ? null : (bootErrors.get(name) ?? null),
    }))
    .toSorted((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1; // running first
      const diff = (lastActive.get(b.name) ?? 0) - (lastActive.get(a.name) ?? 0);
      return diff || a.name.localeCompare(b.name); // most-recent, then stable alpha
    });
}

// Why each AVD's last boot exited early (its most telling log line). A healthy
// emulator runs until killed, so an early exit means the boot failed — we capture
// the reason (skin/system-image/panic errors) so the UI can show it rather than
// timing out. Cleared when that AVD is booted again.
const bootErrors = new Map<string, string>();
// If the emulator process exits within this long of launch, treat it as a failed
// boot; a later exit is just a normal shutdown/kill of a running emulator.
const BOOT_FAIL_WINDOW_MS = 180_000;

// The most telling line from an emulator's exit output — it logs failures as
// `ERROR | <msg>` or `PANIC: <msg>`. Falls back to the exit code; '' = clean exit.
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

// Boot an AVD. `headless` adds -no-window: no host GUI, adb-only — ideal for a
// machine that just streams to the browser. Detached so it outlives... nothing,
// but doesn't block the request; boot takes ~20–60s before adb sees it.
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
  // Cold boot: skip loading the saved snapshot, which recovers an AVD that crashes
  // on every boot from a corrupt `default_boot` snapshot (slower — a full boot).
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

// Shut a running emulator down via `adb emu kill`. Emulators only — physical
// devices don't respond to this (the caller surfaces the error).
export function killEmulator(serial: string): void {
  execFileSync('adb', ['-s', serial, 'emu', 'kill']);
}
