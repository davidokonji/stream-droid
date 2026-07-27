import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { match } from 'ts-pattern';
import { config, fail } from './config.ts';
import { log } from './log.ts';
import { targetSerial } from './adb.ts';
import { hasAdb, hasEmulator, listAvds, startEmulator } from './emulator.ts';

export function preflight(): void {
  if (!hasAdb()) {
    fail(
      '`adb` not found on PATH.',
      'Install Android platform-tools and add it to PATH, e.g. `brew install --cask android-platform-tools` ' +
        'or add $ANDROID_HOME/platform-tools.',
    );
  }

  if (config.CAPTURE === 'scrcpy') {
    if (config.SCRCPY_JAR && !existsSync(config.SCRCPY_JAR)) {
      fail(
        `scrcpy server jar not found: ${config.SCRCPY_JAR}`,
        'Check the path (must be a scrcpy-server v4.1 jar), or omit --scrcpy-server ' +
          'to auto-download the pinned jar.',
      );
    }
  } else if (config.CAPTURE !== 'screenrecord' && config.CAPTURE !== 'grpc') {
    fail(`unknown --capture "${config.CAPTURE}".`, 'Use "screenrecord" (default), "scrcpy", or "grpc".');
  }

  if (!hasEmulator()) {
    log.warn("SDK `emulator` not found — the sidebar can't list or boot AVDs.");
    log.warn('  Set ANDROID_HOME (e.g. ~/Library/Android/sdk) or add the emulator dir to PATH.');
    log.warn('  Streaming an already-running device still works.');
  }
  log.debug(`preflight ok — adb + ${hasEmulator() ? 'emulator' : 'no emulator'} · capture ${config.CAPTURE}`);
}

function buildAsset(label: string, cmd: string, args: string[]): void {
  log.info(`building ${label}…`);
  log.debug(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: config.ROOT });
  if (r.status !== 0) fail(`${label} build failed`, `try it manually: ${cmd} ${args.join(' ')}`);
}

function tailwindCli(): string {
  const pkgPath = createRequire(import.meta.url).resolve('@tailwindcss/cli/package.json');
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin as string | Record<string, string>;
  return join(dirname(pkgPath), typeof bin === 'string' ? bin : bin.tailwindcss!);
}

export function ensureAssetsBuilt(): void {
  if (!existsSync(join(config.PUBLIC, 'app.css'))) {
    buildAsset('styles', process.execPath, [
      tailwindCli(),
      '-i',
      'src/ui/styles.css',
      '-o',
      'public/app.css',
      '--minify',
    ]);
  }
  if (!existsSync(join(config.PUBLIC, 'client.js'))) {
    buildAsset('client', process.execPath, ['scripts/build-client.mjs']);
  }
}

export function bootTargetIfNeeded(): void {
  if (!config.TARGET || targetSerial()) return; // no target, or already running
  const avd = listAvds().find((n) => n.toLowerCase() === config.TARGET.toLowerCase());
  if (!avd) {
    log.warn(`target "${config.TARGET}" is not a running device or known AVD`);
    return;
  }
  try {
    startEmulator(avd);
    log.info(`booting "${avd}" — will stream it once online`);
  } catch (e) {
    log.error(`could not boot "${avd}": ${(e as Error).message}`);
  }
}

// Open a URL in the platform's default browser (best-effort, non-blocking).
export function openBrowser(url: string): void {
  const [cmd, args] = match(process.platform)
    .with('darwin', () => ['open', [url]] as const)
    .with('win32', () => ['cmd', ['/c', 'start', '', url]] as const)
    .otherwise(() => ['xdg-open', [url]] as const);
  log.debug(`opening browser: ${cmd} ${[...args].join(' ')}`);
  try {
    spawn(cmd, [...args], { stdio: 'ignore', detached: true }).unref();
  } catch (e) {
    log.error(`could not open browser: ${(e as Error).message}`);
  }
}
