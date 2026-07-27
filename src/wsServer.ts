import type http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { match } from 'ts-pattern';
import { config, isAuthorized } from './config.ts';
import { logger } from './log.ts';
import { adbFor, deviceSize, resolveSerial, sendPoster } from './adb.ts';
import { startCapture } from './capture/select.ts';
import { pickController, type Incoming } from './controllers.ts';
import { dumpHierarchy, findElement } from './semantic.ts';
import type { CaptureHandle, CaptureMeta } from './capture/types.ts';

const log = logger('ws');
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const BOOT_WAIT_MS = 150_000; // ~2.5 min — cold emulator boots can be slow
const stillBooting = (msg: string): boolean =>
  /can't find service|device (still )?offline|closed|no devices|not found|error: device|wm size/i.test(msg);

async function awaitDeviceSize(ws: WebSocket, serial: string): Promise<CaptureMeta | null> {
  const deadline = Date.now() + BOOT_WAIT_MS;
  let waited = false;
  for (;;) {
    try {
      return deviceSize(serial);
    } catch (e) {
      const msg = (e as Error).message;
      if (!stillBooting(msg) || Date.now() > deadline || ws.readyState !== ws.OPEN) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', message: msg }));
        return null;
      }
      if (!waited) {
        log.info(`${serial}: framework still booting — waiting…`);
        waited = true;
      }
      // eslint-disable-next-line no-await-in-loop -- deliberate: poll boot readiness sequentially
      await sleep(2000);
    }
  }
}

// A one-line summary of a control message for debug logs.
function summarize(msg: Incoming): string {
  return match(msg)
    .with({ type: 'tap' }, (m) => `tap ${m.x.toFixed(2)},${m.y.toFixed(2)}`)
    .with(
      { type: 'swipe' },
      (m) => `swipe ${m.x1.toFixed(2)},${m.y1.toFixed(2)} → ${m.x2.toFixed(2)},${m.y2.toFixed(2)}`,
    )
    .with({ type: 'longPress' }, (m) => `longPress ${m.x.toFixed(2)},${m.y.toFixed(2)}`)
    .with(
      { type: 'scroll' },
      (m) => `scroll ${m.x.toFixed(2)},${m.y.toFixed(2)} Δ${m.dx.toFixed(2)},${m.dy.toFixed(2)}`,
    )
    .with({ type: 'text' }, (m) => `text ${JSON.stringify(m.value)}`)
    .with({ type: 'key' }, (m) => `key ${m.key}`)
    .with({ type: 'tapElement' }, (m) => `tapElement ${m.id ? `#${m.id}` : JSON.stringify(m.text)}`)
    .exhaustive();
}

export function attachWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    const addr = req.socket.remoteAddress ?? '?';
    const serial = resolveSerial(new URL(req.url ?? '/', 'http://localhost').searchParams.get('serial'));
    if (!serial) {
      log.debug(`${addr} connected but no device to stream`);
      ws.send(
        JSON.stringify({ type: 'error', message: 'no running device — start an emulator from the sidebar' }),
      );
      return;
    }

    // Waits out a still-booting emulator instead of erroring; null = gave up / closed.
    const size = await awaitDeviceSize(ws, serial);
    if (!size) return;

    // View-only unless the connection presents the control token (tunnel mode).
    const authorized = isAuthorized(req.url);
    log.info(
      `${addr} → ${serial} · ${config.CAPTURE} · ${size.w}×${size.h}${authorized ? '' : ' · view-only'}`,
    );
    ws.send(JSON.stringify({ type: 'meta', ...size, codec: config.CODEC, control: authorized }));

    const adbArgs = adbFor(serial);

    if (config.CODEC === 'h264') sendPoster(ws, adbArgs);

    const t0 = Date.now();
    let frames = 0;
    let bytes = 0;

    let capture: CaptureHandle;
    try {
      capture = startCapture(
        serial,
        adbArgs,
        size,
        (chunk) => {
          if (ws.readyState === ws.OPEN) ws.send(chunk); // binary frame (H.264 or PNG)
          frames++;
          bytes += chunk.length;
          if (frames === 1) log.debug(`${serial}: first frame in ${Date.now() - t0}ms (${chunk.length}b)`);
          else if (config.VERBOSE && frames % 120 === 0)
            log.debug(`${serial}: ${frames} frames · ${mb(bytes)}`);
        },
        () => {
          if (ws.readyState === ws.OPEN) ws.close();
        },
      );
    } catch (e) {
      log.error(`${serial}: capture failed to start: ${(e as Error).message}`);
      ws.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
      ws.close();
      return;
    }

    const { control, via } = pickController(capture, size, adbArgs);
    if (authorized) log.info(`${serial}: input via ${via}`);

    ws.on('message', async (data: Buffer, isBinary: boolean) => {
      if (isBinary || !authorized) return; // view-only sessions can watch but not drive
      let msg: Incoming;
      try {
        msg = JSON.parse(data.toString()) as Incoming;
      } catch (e) {
        log.warn(`bad control message: ${(e as Error).message}`);
        return;
      }
      log.debug(`${serial} ◂ ${summarize(msg)}`);

      await match(msg)
        .with({ type: 'tapElement' }, async (m) => {
          try {
            const el = findElement(await dumpHierarchy(adbArgs), { id: m.id, text: m.text });
            if (el) {
              log.debug(`${serial}: resolved ${summarize(m)} → ${el.center[0]},${el.center[1]}`);
              control({ type: 'tap', x: el.center[0] / size.w, y: el.center[1] / size.h });
            } else {
              log.warn(`no element matched ${JSON.stringify(m)}`);
            }
          } catch (e) {
            log.error(`semantic tap failed: ${(e as Error).message}`);
          }
        })
        .with({ type: 'longPress' }, (m) => {
          control({ type: 'swipe', x1: m.x, y1: m.y, x2: m.x, y2: m.y, ms: m.ms ?? 500 });
        })
        .with({ type: 'scroll' }, (m) => {
          // Content moves by (dx,dy); the finger drags the opposite way.
          control({
            type: 'swipe',
            x1: m.x,
            y1: m.y,
            x2: clamp01(m.x - m.dx),
            y2: clamp01(m.y - m.dy),
            ms: 120,
          });
        })
        .otherwise((m) => control(m));
    });

    ws.on('close', () => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      log.info(`${serial} disconnected · ${secs}s · ${frames} frames · ${mb(bytes)}`);
      capture.stop();
    });
  });
}
