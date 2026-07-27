// scrcpy capture backend — high-FPS, low-latency H.264 via scrcpy-server.jar.
//
// scrcpy has no "stream to stdout" mode; the way ws-scrcpy and friends consume
// it is to drive the server jar directly over adb:
//
//   1. adb push scrcpy-server.jar        → /data/local/tmp/scrcpy-server.jar
//   2. adb forward tcp:PORT localabstract:scrcpy
//   3. adb shell CLASSPATH=… app_process / com.genymobile.scrcpy.Server <ver> …
//   4. connect TCP to localhost:PORT, read the video socket
//
// Steps 1–2 (an ~730KB push + a forward) run **asynchronously** so they never
// block the Node event loop / other clients; the server spawns only once both
// finish. With control=true we open a SECOND socket for input injection.
//
// Pinned to scrcpy-server **v4.1** (works on Android 14/15/16 — it uses
// DisplayManager.createVirtualDisplay; the old SurfaceControl.createDisplay API
// that v1.24 relied on was removed in Android 14). The version string is imported
// from scrcpyServer.ts (single source of truth) and MUST match the jar's build or
// the server hard-fails on startup.
//
// We pass **raw_stream=true**, which disables ALL of scrcpy's framing — no dummy
// byte, no 64-byte device name, no codec/size header, and (crucially) none of
// the recurring 12-byte session-meta blocks scrcpy otherwise injects mid-stream
// on every rotation/resize. The socket therefore carries a pure H.264 Annex-B
// elementary stream (SPS/PPS + IDR + frames) that we forward verbatim to jMuxer.
// Dimensions come from `adb shell wm size` (see adb.ts), so we don't miss the
// header. (Protocol verified against the v4.1 source.)

import net from 'node:net';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.ts';
import { logger } from '../log.ts';
import { VERSION } from './scrcpyServer.ts';
import type { CaptureHandle, ScrcpyOptions } from './types.ts';

const log = logger('scrcpy');
const execFileP = promisify(execFile);

const REMOTE_JAR = '/data/local/tmp/scrcpy-server.jar';
const SOCKET_NAME = 'localabstract:scrcpy'; // scid omitted → fixed name
const MAX_ATTEMPTS = 100; // ~15s at 150ms — bounds both the video and control connect retries

// Seams for testing: the adb invocations (push/forward + server spawn) and the
// retry cap can be overridden so the connect/retry/teardown state machine can be
// driven against a local TCP server, offline, without a device.
export interface ScrcpyDeps {
  execAdb?: (args: string[]) => Promise<void>;
  spawnAdb?: (args: string[]) => ChildProcess;
  maxAttempts?: number;
}

export function startScrcpy(
  {
    adbArgs,
    serverJar,
    port = 27183,
    control = false,
    maxSize = 0,
    bitRate = 8_000_000,
    onChunk,
    onError,
  }: ScrcpyOptions,
  deps: ScrcpyDeps = {},
): CaptureHandle {
  const execAdb = deps.execAdb ?? ((args: string[]) => execFileP('adb', args).then(() => undefined));
  const spawnAdb =
    deps.spawnAdb ?? ((args: string[]) => spawn('adb', args, { stdio: ['ignore', 'pipe', 'pipe'] }));
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;

  if (!serverJar) {
    // Normally resolved (and auto-downloaded) by ensureScrcpyJar() before serving.
    throw new Error(
      `scrcpy capture needs the server jar (scrcpy-server v${VERSION}). ` +
        'Pass --scrcpy-server <path>, or let it auto-download (omit the flag).',
    );
  }

  let alive = true;
  let stopped = false;
  let server: ChildProcess | null = null;
  let sock: net.Socket | null = null;
  let ctrlSock: net.Socket | null = null;
  let established = false; // video socket accepted by the server
  let streaming = false; // first video bytes seen (for logging)
  let ctrlReady = false; // control socket connected & writable
  let pendingRetry = false;
  let ctrlAttempts = 0;
  let grace: ReturnType<typeof setTimeout> | null = null;

  // Tear everything down: kill the device-side server, drop the adb forward, and
  // destroy sockets. Idempotent — called from stop() AND from any fatal failure,
  // so a wedged setup never leaks the server process or leaves the fixed
  // localabstract socket bound (which would break every later scrcpy attempt).
  const teardown = (): void => {
    if (stopped) return;
    stopped = true;
    alive = false;
    if (grace) {
      clearTimeout(grace);
      grace = null;
    }
    sock?.destroy();
    ctrlSock?.destroy();
    server?.kill('SIGKILL');
    // best-effort, async — the forward may already be gone
    void execAdb(adbArgs('forward', '--remove', `tcp:${port}`)).catch(() => {});
  };

  const fail = (msg: string): void => {
    if (stopped) return;
    onError?.(new Error(msg));
    teardown();
  };

  // Control socket. scrcpy accepts the video socket first, then BLOCKS in accept()
  // for the control socket before streaming video — so we open control as soon as
  // the video socket is *established*, not after video data flows (deadlock
  // otherwise). It retries the adb-forward accept race like the video socket;
  // until it's connected, callers fall back to `adb input`.
  const openControl = (): void => {
    if (!alive || !control || ctrlReady) return;
    const s = net.connect(port, '127.0.0.1');
    ctrlSock = s;
    s.on('connect', () => {
      ctrlReady = true;
      ctrlAttempts = 0;
      log.debug(`control socket up on :${port}`);
    });
    s.on('data', () => {
      /* drain device→client messages (clipboard, acks) */
    });
    const retryControl = (): void => {
      ctrlReady = false;
      if (!alive || stopped) return;
      if (ctrlAttempts++ >= maxAttempts) {
        fail('scrcpy: control socket never established');
        return;
      }
      setTimeout(openControl, 150);
    };
    s.on('error', retryControl);
    s.on('close', retryControl);
  };

  const markEstablished = (): void => {
    if (established) return;
    established = true;
    openControl();
  };

  // tunnel_forward means the server listens and we connect. But `adb forward`
  // accepts locally before scrcpy's localabstract socket exists, so an early
  // connect opens then closes at once. Retry (single timer, never a tight loop)
  // until the video socket connects AND survives a short grace window.
  const scheduleRetry = (attempt: number): void => {
    if (!alive || established || pendingRetry) return;
    if (attempt >= maxAttempts) {
      fail('scrcpy: video socket never established');
      return;
    }
    pendingRetry = true;
    setTimeout(() => {
      pendingRetry = false;
      connectVideo(attempt + 1);
    }, 150);
  };

  const connectVideo = (attempt = 0): void => {
    if (!alive || established) return;
    sock?.destroy();
    const s = net.connect(port, '127.0.0.1');
    sock = s;
    // Surviving 150ms open means the server accepted us as the video socket
    // (a not-yet-ready server closes the forwarded connection immediately).
    s.on('connect', () => {
      grace = setTimeout(markEstablished, 150);
    });
    s.on('data', (data: Buffer) => {
      if (grace) {
        clearTimeout(grace);
        grace = null;
      }
      markEstablished();
      if (!streaming) {
        streaming = true;
        log.debug(`raw H.264 stream up on :${port}`);
      }
      onChunk(data);
    });
    // Both 'error' and 'close' can fire for one dead connect; pendingRetry
    // collapses them into a single delayed attempt.
    const bail = (): void => {
      if (grace) {
        clearTimeout(grace);
        grace = null;
      }
      if (!established) scheduleRetry(attempt);
    };
    s.on('error', bail);
    s.on('close', bail);
  };

  // Push the jar and forward the port asynchronously, then spawn the server and
  // start connecting. Doing the push/forward off the sync path keeps the event
  // loop responsive for every other client while a new scrcpy stream starts.
  void (async () => {
    try {
      await execAdb(adbArgs('push', serverJar, REMOTE_JAR));
      await execAdb(adbArgs('forward', `tcp:${port}`, SOCKET_NAME));
    } catch (e) {
      fail(`scrcpy setup failed: ${(e as Error).message}`);
      return;
    }
    if (!alive) return; // stopped during setup

    // raw_stream keeps the VIDEO socket a bare H.264 feed; control=true also opens
    // a control socket for input injection.
    server = spawnAdb(
      adbArgs(
        'shell',
        `CLASSPATH=${REMOTE_JAR}`,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        VERSION,
        'tunnel_forward=true',
        'audio=false',
        `control=${control}`,
        'video=true',
        'video_codec=h264',
        `video_bit_rate=${bitRate}`,
        `max_size=${maxSize}`,
        'raw_stream=true',
      ),
    );
    // scrcpy-server's own logs — only surface them in verbose mode.
    server.stdout?.on('data', (d: Buffer) => {
      if (config.VERBOSE) process.stdout.write(`[scrcpy] ${d}`);
    });
    server.stderr?.on('data', (d: Buffer) => {
      if (config.VERBOSE) process.stderr.write(`[scrcpy] ${d}`);
    });
    server.on('error', (e: Error) => fail(e.message));
    connectVideo();
  })();

  return {
    name: 'scrcpy',
    // Exposed only when control was requested; server routes input here instead
    // of `adb input`. Drops writes until the control socket is up — callers gate
    // on controlReady() and fall back to adb input, so nothing is silently lost.
    writeControl: control
      ? (buf: Buffer) => {
          if (ctrlReady && ctrlSock?.writable) ctrlSock.write(buf);
        }
      : undefined,
    controlReady: control ? () => ctrlReady : undefined,
    stop: teardown,
  };
}
