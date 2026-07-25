import { execFileSync } from 'node:child_process';
import { logger } from './log.ts';

const log = logger('apps');

type AdbArgs = (...r: string[]) => string[];
const shell = (adbArgs: AdbArgs, ...cmd: string[]): string =>
  execFileSync('adb', adbArgs('shell', ...cmd), { encoding: 'utf8' });

// `pm list packages` → sorted package names (strips the `package:` prefix).
export function parsePackages(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.trim().replace(/^package:/, ''))
    .filter(Boolean)
    .toSorted();
}

// Best-effort foreground package from `dumpsys activity activities` — the line
// shape varies across Android versions, so match the common resumed/focused
// fields and pull the `uN <package>/<activity>` token.
export function parseForeground(out: string): string | null {
  const m = out.match(
    /(?:mResumedActivity|topResumedActivity|mFocusedApp)[^\n]*?\bu\d+\s+([a-zA-Z][\w.]*)\//,
  );
  return m ? m[1]! : null;
}

// Installed packages (third-party by default; `all` includes system packages).
export function listPackages(adbArgs: AdbArgs, all = false): string[] {
  const args = all ? ['pm', 'list', 'packages'] : ['pm', 'list', 'packages', '-3'];
  return parsePackages(shell(adbArgs, ...args));
}

export function foregroundApp(adbArgs: AdbArgs): string | null {
  try {
    return parseForeground(shell(adbArgs, 'dumpsys', 'activity', 'activities'));
  } catch (e) {
    log.debug(`foreground lookup failed: ${(e as Error).message}`);
    return null;
  }
}

// Launch an app's launcher activity by package — `monkey` resolves the activity,
// so callers don't need to know it.
export function launchApp(adbArgs: AdbArgs, pkg: string): void {
  execFileSync('adb', adbArgs('shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'), {
    stdio: 'ignore',
  });
}
