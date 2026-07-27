import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import { config, isAuthorized } from './config.ts';
import { adbFor, resolveSerial } from './adb.ts';
import {
  accelStatus,
  avdStatuses,
  deviceBooted,
  hasAdb,
  hasEmulator,
  killEmulator,
  listDevices,
  startEmulator,
} from './emulator.ts';
import { dumpHierarchy } from './semantic.ts';
import { foregroundApp, launchApp, listPackages } from './apps.ts';
import { stopTunnel, tunnelInfo } from './tunnel.ts';

const STATIC: Record<string, string> = {
  '/': 'text/html; charset=utf-8',
  '/index.html': 'text/html; charset=utf-8',
  '/client.js': 'text/javascript; charset=utf-8',
  '/app.css': 'text/css; charset=utf-8',
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });

const json = (res: http.ServerResponse, code: number, body: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

// Remote = not the local operator, so no control-token share link/QR or stop.
// Loopback + no relay header is the operator; a LAN peer (non-loopback, our port
// binds 0.0.0.0) or a tunnel viewer (adds a forwarding header) is remote.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isRemote = (req: http.IncomingMessage): boolean =>
  Boolean(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) ||
  !LOOPBACK.has(req.socket.remoteAddress ?? '');

function serveStatic(res: http.ServerResponse, path: string): void {
  const file = path === '/' ? '/index.html' : path;
  const contentType = STATIC[file];
  if (!contentType) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    res.writeHead(200, { 'content-type': contentType });
    res.end(readFileSync(join(config.PUBLIC, file)));
  } catch {
    res.writeHead(404).end('not found');
  }
}

export function createHttpServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? '/'; // route on the path; auth reads ?k= off `url`
    const q = new URL(url, 'http://localhost').searchParams;

    await match({ path, method: req.method })
      // Emulator state for the sidebar (+ host-only share info).
      .with({ path: '/api/state' }, () => {
        json(res, 200, {
          avds: avdStatuses(),
          devices: listDevices(),
          capture: config.CAPTURE,
          target: config.TARGET,
          tunnel: tunnelInfo(!isRemote(req)), // share panel is host-only
        });
      })
      // Stop sharing without killing the server — host only (see isRemote).
      .with({ path: '/api/tunnel', method: 'POST' }, async () => {
        if (isRemote(req)) {
          json(res, 403, { ok: false, error: 'only the host can manage sharing' });
          return;
        }
        try {
          const { action } = JSON.parse((await readBody(req)) || '{}') as { action?: string };
          if (action !== 'stop') {
            json(res, 400, { ok: false, error: 'unsupported action — only "stop"' });
            return;
          }
          const stopped = stopTunnel();
          json(res, 200, { ok: true, stopped, tunnel: tunnelInfo(true) });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Boot an AVD (control-gated).
      .with({ path: '/api/start', method: 'POST' }, async () => {
        if (!isAuthorized(url)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        try {
          const { avd, headless, cold } = JSON.parse(await readBody(req)) as {
            avd?: string;
            headless?: boolean;
            cold?: boolean; // skip the saved snapshot — recovers a crash-on-boot AVD
          };
          if (!avd) {
            json(res, 400, { ok: false, error: 'avd required' });
            return;
          }
          json(res, 200, { ok: true, ...startEmulator(avd, { headless: !!headless, cold: !!cold }) });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      .with({ path: '/api/health' }, () => {
        const devices = listDevices().map((d) => ({
          serial: d.serial,
          avd: d.avd,
          booted: deviceBooted(d.serial),
        }));
        json(res, 200, { accel: accelStatus(), adb: hasAdb(), emulator: hasEmulator(), devices });
      })
      .with({ path: '/api/stop', method: 'POST' }, async () => {
        if (!isAuthorized(url)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        try {
          const { serial: reqSerial } = JSON.parse(await readBody(req)) as { serial?: string };

          const devs = listDevices();
          const want = (reqSerial ?? '').toLowerCase();
          const serial = want
            ? devs.find((d) => d.serial.toLowerCase() === want || d.avd.toLowerCase() === want)?.serial
            : devs[0]?.serial;
          if (!serial) {
            json(res, 400, { ok: false, error: 'no matching running device' });
            return;
          }
          killEmulator(serial);
          json(res, 200, { ok: true, serial });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // App management: installed packages + current foreground app.
      .with({ path: '/api/apps' }, () => {
        const serial = resolveSerial(q.get('serial'));
        if (!serial) {
          json(res, 400, { ok: false, error: 'no running device' });
          return;
        }
        try {
          const adbArgs = adbFor(serial);
          json(res, 200, {
            serial,
            foreground: foregroundApp(adbArgs),
            packages: listPackages(adbArgs, q.get('all') === '1'),
          });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Launch an app by package (control-gated, like /api/start).
      .with({ path: '/api/launch', method: 'POST' }, async () => {
        if (!isAuthorized(url)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        const serial = resolveSerial(q.get('serial'));
        if (!serial) {
          json(res, 400, { ok: false, error: 'no running device' });
          return;
        }
        try {
          const { package: pkg } = JSON.parse(await readBody(req)) as { package?: string };
          if (!pkg) {
            json(res, 400, { ok: false, error: 'package required' });
            return;
          }
          launchApp(adbFor(serial), pkg);
          json(res, 200, { ok: true, package: pkg });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Semantic layer: the current window's accessibility/view hierarchy.
      .with({ path: '/api/hierarchy' }, async () => {
        const serial = resolveSerial(q.get('serial'));
        if (!serial) {
          json(res, 400, { ok: false, error: 'no running device' });
          return;
        }
        try {
          const nodes = await dumpHierarchy(adbFor(serial));
          json(res, 200, { serial, count: nodes.length, nodes });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Static assets, else 404.
      .otherwise(() => serveStatic(res, path));
  });
}
