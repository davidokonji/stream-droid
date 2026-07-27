// HTTP server: serves the built client assets and the small emulator/semantic API.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import { config, isAuthorized } from './config.ts';
import { adbFor, resolveSerial } from './adb.ts';
import { avdStatuses, killEmulator, listDevices, startEmulator } from './emulator.ts';
import { dumpHierarchy } from './semantic.ts';
import { foregroundApp, launchApp, listPackages } from './apps.ts';

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
    // No per-request access log: every route here is the tool's own internal
    // traffic (the browser client + drive.mjs), and the 3 s poll would flood the
    // terminal — even under -v. Real debug detail lives in the WS/capture logs.

    await match({ path, method: req.method })
      // Emulator state for the sidebar.
      .with({ path: '/api/state' }, () => {
        json(res, 200, {
          avds: avdStatuses(),
          devices: listDevices(),
          capture: config.CAPTURE,
          target: config.TARGET,
        });
      })
      // Boot an AVD (control-gated).
      .with({ path: '/api/start', method: 'POST' }, async () => {
        if (!isAuthorized(url)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        try {
          const { avd, headless } = JSON.parse(await readBody(req)) as { avd?: string; headless?: boolean };
          if (!avd) {
            json(res, 400, { ok: false, error: 'avd required' });
            return;
          }
          json(res, 200, { ok: true, ...startEmulator(avd, { headless: !!headless }) });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Shut down a running emulator (control-gated, like /api/start). Used by the
      // UI to close a headless emulator entirely when you're done streaming it.
      .with({ path: '/api/stop', method: 'POST' }, async () => {
        if (!isAuthorized(url)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        try {
          const { serial: reqSerial } = JSON.parse(await readBody(req)) as { serial?: string };
          const serial = resolveSerial(reqSerial ?? null);
          if (!serial) {
            json(res, 400, { ok: false, error: 'no matching device' });
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
