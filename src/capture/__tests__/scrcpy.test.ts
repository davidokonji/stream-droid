// Integration tests for the scrcpy connect / retry / teardown state machine.
// The adb invocations (push/forward + server spawn) are injected, and a real
// local TCP server stands in for the adb-forwarded scrcpy socket — so the socket
// logic runs for real, offline, without a device.

import { afterEach, describe, expect, test } from 'bun:test';
import net from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { startScrcpy, type ScrcpyDeps } from '../scrcpy.ts';
import type { CaptureHandle } from '../types.ts';

const VIDEO_CHUNK = Buffer.from([0, 0, 0, 1, 0x67]); // an H.264-looking NAL

// Stand-in for the adb-forwarded scrcpy socket. Optionally destroys the first
// `failFirst` connections (the adb-forward accept race) or every connection
// (`destroyAll`); otherwise serves the first survivor as the video socket (sends
// a chunk) and keeps later sockets (control) open.
function fakeForward(opts: { failFirst?: number; destroyAll?: boolean; controlSend?: Buffer } = {}): {
  server: net.Server;
  connections: () => number;
} {
  let failFirst = opts.failFirst ?? 0;
  let videoSent = false;
  let count = 0;
  const server = net.createServer((sock) => {
    count++;
    if (opts.destroyAll || failFirst > 0) {
      failFirst--;
      sock.destroy();
      return;
    }
    if (!videoSent) {
      videoSent = true;
      sock.write(VIDEO_CHUNK);
      return;
    }
    if (opts.controlSend) sock.write(opts.controlSend);
    sock.on('data', () => {});
  });
  return { server, connections: () => count };
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
  });
}

const noop = (): void => {
  /* no-op */
};

// ChildProcess double for the device-side server spawn — tracks kill().
function fakeServerProc(): { proc: ChildProcess; killed: () => boolean } {
  let killed = false;
  const proc = {
    stdout: { on: noop },
    stderr: { on: noop },
    on: noop,
    kill: () => {
      killed = true;
    },
  } as unknown as ChildProcess;
  return { proc, killed: () => killed };
}

// Poll `cond` every 10ms until true or the deadline. Timer-driven (not a
// while-await loop) so it stays a single, non-blocking chain.
function waitFor(cond: () => boolean, ms = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const tick = (): void => {
      if (cond()) return resolve(true);
      if (Date.now() >= end) return resolve(false);
      setTimeout(tick, 10);
    };
    tick();
  });
}

const idArgs = (...r: string[]): string[] => r;

let handle: CaptureHandle | null = null;
let srv: net.Server | null = null;

afterEach(() => {
  handle?.stop();
  handle = null;
  srv?.close();
  srv = null;
});

describe('startScrcpy state machine', () => {
  test('connects, streams a frame, brings up control, then tears down', async () => {
    const fwd = fakeForward();
    srv = fwd.server;
    const port = await listen(srv);

    const execCalls: string[][] = [];
    const sp = fakeServerProc();
    const deps: ScrcpyDeps = {
      execAdb: async (args) => {
        execCalls.push(args);
      },
      spawnAdb: () => sp.proc,
      maxAttempts: 20,
    };

    let chunk: Buffer | null = null;
    handle = startScrcpy(
      { adbArgs: idArgs, serverJar: '/x/scrcpy-server', port, control: true, onChunk: (c) => (chunk = c) },
      deps,
    );

    expect(await waitFor(() => chunk !== null)).toBe(true);
    expect(chunk!.equals(VIDEO_CHUNK)).toBe(true);
    expect(await waitFor(() => handle!.controlReady?.() === true)).toBe(true);

    // setup pushed the jar and added the forward
    expect(execCalls.some((a) => a[0] === 'push')).toBe(true);
    expect(execCalls.some((a) => a[0] === 'forward' && a[1] === `tcp:${port}`)).toBe(true);

    handle.stop();
    // teardown kills the device-side server and removes the forward
    expect(sp.killed()).toBe(true);
    expect(execCalls.some((a) => a[0] === 'forward' && a[1] === '--remove')).toBe(true);
  });

  test('retries the accept race until the video socket establishes', async () => {
    const fwd = fakeForward({ failFirst: 2 });
    srv = fwd.server;
    const port = await listen(srv);
    const sp = fakeServerProc();

    let chunk: Buffer | null = null;
    handle = startScrcpy(
      { adbArgs: idArgs, serverJar: '/x', port, control: false, onChunk: (c) => (chunk = c) },
      { execAdb: async () => undefined, spawnAdb: () => sp.proc, maxAttempts: 20 },
    );

    expect(await waitFor(() => chunk !== null)).toBe(true);
    // it took more than one attempt: 2 rejected + 1 video
    expect(fwd.connections()).toBeGreaterThanOrEqual(3);
  });

  test('gives up after maxAttempts, surfacing an error and tearing down', async () => {
    const fwd = fakeForward({ destroyAll: true });
    srv = fwd.server;
    const port = await listen(srv);

    const execCalls: string[][] = [];
    const sp = fakeServerProc();
    let err: Error | null = null;
    handle = startScrcpy(
      {
        adbArgs: idArgs,
        serverJar: '/x',
        port,
        control: false,
        onChunk: () => undefined,
        onError: (e) => (err = e),
      },
      {
        execAdb: async (a) => {
          execCalls.push(a);
        },
        spawnAdb: () => sp.proc,
        maxAttempts: 3,
      },
    );

    expect(await waitFor(() => err !== null)).toBe(true);
    expect(err!.message).toMatch(/video socket never established/);
    expect(sp.killed()).toBe(true);
    expect(execCalls.some((a) => a[0] === 'forward' && a[1] === '--remove')).toBe(true);
  });

  test('a device CLIPBOARD message on the control socket reaches a subscriber', async () => {
    const text = 'copied on device';
    const utf8 = Buffer.from(text, 'utf8');
    const msg = Buffer.alloc(5 + utf8.length);
    msg.writeUInt8(0, 0); // DEVICE_MSG_TYPE_CLIPBOARD
    msg.writeUInt32BE(utf8.length, 1);
    utf8.copy(msg, 5);

    const fwd = fakeForward({ controlSend: msg });
    srv = fwd.server;
    const port = await listen(srv);

    const sp = fakeServerProc();
    const deps: ScrcpyDeps = { execAdb: async () => {}, spawnAdb: () => sp.proc, maxAttempts: 20 };

    const got: string[] = [];
    handle = startScrcpy(
      { adbArgs: idArgs, serverJar: '/x/scrcpy-server', port, control: true, onChunk: () => {} },
      deps,
    );
    // Safe to subscribe synchronously: the control socket can't connect until the
    // awaited push/forward resolves, which is at least a microtask away.
    handle.subscribeClipboard!((t) => got.push(t));

    expect(await waitFor(() => got.length > 0)).toBe(true);
    expect(got).toEqual([text]);
  });
});
