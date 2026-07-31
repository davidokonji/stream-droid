import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { match } from 'ts-pattern';
import { config, isRemote, canControl } from './config.ts';
import { adbFor, resolveSerial } from './adb.ts';
import {
  accelStatus,
  avdStatuses,
  deviceBooted,
  hasAdb,
  hasEmulator,
  killEmulator,
  killHeadlessBooted,
  listDevices,
  startEmulator,
} from './emulator.ts';
import { dumpHierarchy } from './semantic.ts';
import { foregroundApp, launchApp, listPackages } from './apps.ts';
import { ogQr, openTunnel, stopTunnel, tunnelInfo } from './tunnel.ts';

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

const OG_QR_PATH = '/og-qr.png';

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Open Graph tags so the shared link unfurls with the QR as its preview image.
// Injected at serve time rather than baked into index.html because og:image and
// og:url must be absolute, and the public URL only exists once a tunnel is open.
// With no tunnel there is nothing to preview, so nothing is added.
function ogTags(): string {
  const og = ogQr();
  if (!og) return '';
  const image = escapeAttr(`${og.baseUrl}${OG_QR_PATH}`);
  const url = escapeAttr(og.baseUrl);
  return (
    `<meta property="og:title" content="stream-droid — live Android device" />` +
    `<meta property="og:description" content="Scan the QR to open this device on your phone." />` +
    `<meta property="og:type" content="website" />` +
    `<meta property="og:url" content="${url}" />` +
    `<meta property="og:image" content="${image}" />` +
    `<meta property="og:image:width" content="600" />` +
    `<meta property="og:image:height" content="600" />` +
    `<meta name="twitter:card" content="summary_large_image" />` +
    `<meta name="twitter:image" content="${image}" />`
  );
}

function serveStatic(res: http.ServerResponse, path: string): void {
  const file = path === '/' ? '/index.html' : path;
  const contentType = STATIC[file];
  if (!contentType) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = readFileSync(join(config.PUBLIC, file));
    if (file === '/index.html') {
      const tags = ogTags();
      if (tags) {
        res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
        res.end(body.toString('utf8').replace('</head>', `${tags}</head>`));
        return;
      }
    }
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(body);
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
          host: !isRemote(req), // the local operator — device management + sharing are host-only
          tunnel: tunnelInfo(!isRemote(req)), // share panel is host-only
        });
      })
      // Shut the server down (host only) — lets an agent tear down the background
      // server it started so it doesn't linger. Closes any tunnel; emulators stay.
      .with({ path: '/api/shutdown', method: 'POST' }, () => {
        if (isRemote(req)) {
          json(res, 403, { ok: false, error: 'only the host can stop the server' });
          return;
        }
        stopTunnel();
        res.on('finish', () =>
          setTimeout(() => {
            // Closes only emulators verified to still be windowless, so none are
            // stranded unseen. An open one is left running — there is no way to
            // ask over HTTP, and closing a window the user can see needs consent.
            killHeadlessBooted();
            process.exit(0);
          }, 30),
        );
        json(res, 200, { ok: true });
      })
      // Stop sharing without killing the server — host only (see isRemote).
      .with({ path: '/api/tunnel', method: 'POST' }, async () => {
        if (isRemote(req)) {
          json(res, 403, { ok: false, error: 'only the host can manage sharing' });
          return;
        }
        try {
          const { action, control } = JSON.parse((await readBody(req)) || '{}') as {
            action?: string;
            control?: boolean;
          };
          if (action === 'start') {
            const tunnel = await openTunnel(config.PORT, !!control);
            json(res, 200, { ok: true, tunnel });
            return;
          }
          if (action === 'stop') {
            const stopped = stopTunnel();
            json(res, 200, { ok: true, stopped, tunnel: tunnelInfo(true) });
            return;
          }
          json(res, 400, { ok: false, error: 'unsupported action — use "start" or "stop"' });
        } catch (e) {
          json(res, 500, { ok: false, error: (e as Error).message });
        }
      })
      // Boot an AVD — host only. Managing the emulator fleet isn't a "control
      // viewer" capability; a shared session drives the device, it doesn't boot new ones.
      .with({ path: '/api/start', method: 'POST' }, async () => {
        if (isRemote(req)) {
          json(res, 403, { ok: false, error: 'only the host can start devices' });
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
        if (!canControl(req)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
        const devices = listDevices().map((d) => ({
          serial: d.serial,
          avd: d.avd,
          booted: deviceBooted(d.serial),
        }));
        json(res, 200, { accel: accelStatus(), adb: hasAdb(), emulator: hasEmulator(), devices });
      })
      // Stop/kill a device — host only (same reasoning as /api/start).
      .with({ path: '/api/stop', method: 'POST' }, async () => {
        if (isRemote(req)) {
          json(res, 403, { ok: false, error: 'only the host can stop devices' });
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
        if (!canControl(req)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
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
        if (!canControl(req)) {
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
        if (!canControl(req)) {
          json(res, 403, { ok: false, error: 'view-only session' });
          return;
        }
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
      // The og:image for the shared link. Unauthenticated by necessity — the
      // link unfurler that fetches it is an anonymous third party. 404s when no
      // tunnel is open, so nothing is exposed on a purely local session.
      .with({ path: OG_QR_PATH, method: 'GET' }, () => {
        const og = ogQr();
        if (!og) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': og.png.length,
          // Previews are fetched once and cached by the unfurler; don't let a
          // stale QR from a previous tunnel outlive this one on our side.
          'cache-control': 'no-store',
        });
        res.end(og.png);
      })
      .otherwise(() => serveStatic(res, path));
  });
}
