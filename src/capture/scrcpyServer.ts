import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.ts';
import { logger } from '../log.ts';

const log = logger('scrcpy');

// Pinned to scrcpy-server v4.1. Single source of truth — scrcpy.ts imports this
// and passes it to the server, which hard-checks the version string on startup.
export const VERSION = '4.1';

export type Release = { url: string; sha256: string; size: number };

// The pinned release: download URL + expected SHA-256, verified against the
// official asset. Bump both together with VERSION when moving to a new release.
const RELEASE: Release = {
  url: 'https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-server-v4.1',
  sha256: 'deacb991ed2509715160ffdc7907e47b4160eb30d1566217e9047fd5b8850cae',
  size: 733706,
};

// Seams for testing: the pinned release and the fetch implementation can be
// overridden so the download/verify/cache logic runs offline and deterministically.
export type ScrcpyJarDeps = { release?: Release; fetchImpl?: typeof fetch };

function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'stream-droid');
}

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

// Return a filesystem path to a valid scrcpy-server jar, downloading it on first
// use. Throws (with an actionable message) if download or verification fails.
export async function ensureScrcpyJar(deps: ScrcpyJarDeps = {}): Promise<string> {
  const release = deps.release ?? RELEASE;
  const fetchImpl = deps.fetchImpl ?? fetch;

  // 1. User-provided path wins; its existence is validated in preflight().
  if (config.SCRCPY_JAR) return config.SCRCPY_JAR;

  const dest = join(cacheDir(), `scrcpy-server-v${VERSION}`);

  // 2. Reuse a cached copy only if it still matches the pinned checksum.
  if (existsSync(dest)) {
    if (sha256(readFileSync(dest)) === release.sha256) {
      log.debug(`using cached scrcpy-server v${VERSION} (${dest})`);
      return dest;
    }
    log.warn(`cached scrcpy-server v${VERSION} failed checksum — re-downloading`);
  }

  // 3. Download once, verify, then write atomically (tmp + rename).
  const kb = Math.round(release.size / 1024);
  log.info(`scrcpy-server v${VERSION} not found locally — downloading (~${kb} KB)…`);
  const res = await fetchImpl(release.url);
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText} (${release.url})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== release.sha256) {
    throw new Error(
      `checksum mismatch for scrcpy-server v${VERSION}: expected ${release.sha256}, got ${got}. ` +
        'Refusing to run an unexpected binary.',
    );
  }

  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.scrcpy-server-v${VERSION}.${process.pid}.tmp`);
  writeFileSync(tmp, buf);
  renameSync(tmp, dest);
  log.info(`✓ downloaded scrcpy-server v${VERSION} (verified) → ${dest}`);
  return dest;
}
