// HTTP server: serves the built client assets and the small emulator/semantic API.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, isAuthorized } from './config.ts';
import { logger } from './log.ts';
import { adbFor, resolveSerial } from './adb.ts';
import { avdStatuses, listDevices, startEmulator } from './emulator.ts';
import { dumpHierarchy } from './semantic.ts';

const log = logger('http');

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

export function createHttpServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? '/'; // route on the path; auth reads ?k= off `url`
    const t0 = Date.now();
    res.on('finish', () => log.debug(`${req.method} ${path} → ${res.statusCode} (${Date.now() - t0}ms)`));

    // Emulator state for the sidebar.
    if (path === '/api/state') {
      json(res, 200, {
        avds: avdStatuses(),
        devices: listDevices(),
        capture: config.CAPTURE,
        target: config.TARGET,
      });
      return;
    }
    if (path === '/api/start' && req.method === 'POST') {
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
      return;
    }
    // Semantic layer: the current window's accessibility/view hierarchy.
    if (path === '/api/hierarchy') {
      const serial = resolveSerial(new URL(url, 'http://localhost').searchParams.get('serial'));
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
      return;
    }

    // Static files.
    const file = path === '/' ? '/index.html' : path;
    const contentType = STATIC[path === '/' ? '/' : file];
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
  });
}
