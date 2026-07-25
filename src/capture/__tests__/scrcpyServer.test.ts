// Tests for the scrcpy-server jar resolver: user-path passthrough, download +
// SHA-256 verify + cache, cache reuse, corrupt-cache re-download, and the two
// failure modes (HTTP error, checksum mismatch). Fully offline — the release
// descriptor and fetch are injected, and the cache is redirected to a temp dir.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../config.ts';
import { ensureScrcpyJar, type Release } from '../scrcpyServer.ts';

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

const JAR = Buffer.from('fake-scrcpy-server-jar-bytes\n');
const RELEASE: Release = {
  url: 'https://example.test/scrcpy-server-v4.1',
  sha256: sha256(JAR),
  size: JAR.length,
};

// A fetch() double. `body` → a 200 with those bytes; `status` → a failed response.
function fakeFetch(result: { body: Buffer } | { status: number; statusText: string }): {
  fetchImpl: typeof fetch;
  calls: () => number;
} {
  let n = 0;
  const fetchImpl = (async () => {
    n++;
    if ('body' in result) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new Uint8Array(result.body).buffer,
      } as unknown as Response;
    }
    return {
      ok: false,
      status: result.status,
      statusText: result.statusText,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => n };
}

let cacheHome = '';
const cachedJar = (): string => join(cacheHome, 'stream-droid', 'scrcpy-server-v4.1');

beforeEach(() => {
  cacheHome = mkdtempSync(join(tmpdir(), 'sd-scrcpy-'));
  process.env.XDG_CACHE_HOME = cacheHome;
  config.SCRCPY_JAR = '';
});

afterEach(() => {
  rmSync(cacheHome, { recursive: true, force: true });
  delete process.env.XDG_CACHE_HOME;
  config.SCRCPY_JAR = '';
});

describe('ensureScrcpyJar', () => {
  test('returns a user-provided path as-is, without fetching', async () => {
    config.SCRCPY_JAR = '/opt/custom/scrcpy-server.jar';
    const { fetchImpl, calls } = fakeFetch({ body: JAR });

    const path = await ensureScrcpyJar({ release: RELEASE, fetchImpl });

    expect(path).toBe('/opt/custom/scrcpy-server.jar');
    expect(calls()).toBe(0);
  });

  test('downloads, verifies, and caches on first use', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: JAR });

    const path = await ensureScrcpyJar({ release: RELEASE, fetchImpl });

    expect(path).toBe(cachedJar());
    expect(existsSync(path)).toBe(true);
    expect(sha256(readFileSync(path))).toBe(RELEASE.sha256);
    expect(calls()).toBe(1);
  });

  test('reuses the cached jar on the next call (no second fetch)', async () => {
    const first = fakeFetch({ body: JAR });
    await ensureScrcpyJar({ release: RELEASE, fetchImpl: first.fetchImpl });

    const second = fakeFetch({ body: JAR });
    const path = await ensureScrcpyJar({ release: RELEASE, fetchImpl: second.fetchImpl });

    expect(path).toBe(cachedJar());
    expect(second.calls()).toBe(0);
  });

  test('re-downloads when the cached jar fails its checksum', async () => {
    mkdirSync(join(cacheHome, 'stream-droid'), { recursive: true });
    writeFileSync(cachedJar(), Buffer.from('corrupted'));

    const { fetchImpl, calls } = fakeFetch({ body: JAR });
    const path = await ensureScrcpyJar({ release: RELEASE, fetchImpl });

    expect(calls()).toBe(1);
    expect(sha256(readFileSync(path))).toBe(RELEASE.sha256);
  });

  test('throws and caches nothing when the download fails', async () => {
    const { fetchImpl } = fakeFetch({ status: 404, statusText: 'Not Found' });

    await expect(ensureScrcpyJar({ release: RELEASE, fetchImpl })).rejects.toThrow(
      /download failed: HTTP 404/,
    );
    expect(existsSync(cachedJar())).toBe(false);
  });

  test('rejects mismatched bytes and caches nothing', async () => {
    const { fetchImpl } = fakeFetch({ body: Buffer.from('some other bytes') });

    await expect(ensureScrcpyJar({ release: RELEASE, fetchImpl })).rejects.toThrow(/checksum mismatch/);
    expect(existsSync(cachedJar())).toBe(false);
  });
});
