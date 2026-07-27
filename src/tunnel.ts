// Tunnel lifecycle in one place, so a share can be started at boot and stopped
// later without killing the server. The relay handle is kept here — so stopTunnel()
// and the /api/tunnel route can close it, and /api/state can report whether one is
// live (with a scannable QR for the operator).
//
// Two backends: cloudflared (a `*.trycloudflare.com` link with NO visitor
// interstitial — needs the `cloudflared` binary) and localtunnel (no install, but
// loca.lt shows a reminder page on first visit). `auto` prefers cloudflared when
// available. Both are loaded/started lazily — only when a share is actually opened.

import { spawn, spawnSync } from 'node:child_process';
import { config } from './config.ts';
import { logger } from './log.ts';

const log = logger('tunnel');

interface TunnelHandle {
  url: string;
  close(): void;
}

let current: TunnelHandle | null = null;
let backend: string | null = null; // which relay is in use, for status/logging
let shareUrl: string | null = null; // the link recipients open (carries ?k= in control mode)
let qrSvg: string | null = null; // an SVG QR of shareUrl, for the UI

export interface TunnelInfo {
  active: boolean;
  url: string | null; // public base URL (view-only); safe to expose to anyone
  control: boolean; // whether the shared link carries the control token
  backend: string | null; // 'cloudflared' | 'localtunnel'
  host: boolean; // is the caller the local operator? (gates the share panel + data)
  // The share panel is the host's — only the local operator sees the link/QR (and
  // can stop). A recipient of the shared link (even a control recipient) must not:
  // the QR/link embed the control token, and it's the host's session to manage.
  shareUrl: string | null;
  qr: string | null;
}

// `host` = the caller is the local operator (a direct request, not one forwarded
// in over the relay). Only the host gets the share link/QR and renders the share
// panel; recipients of the shared link never do.
export function tunnelInfo(host: boolean): TunnelInfo {
  return {
    active: current !== null,
    url: current?.url ?? null,
    control: config.TUNNEL_CONTROL,
    backend,
    host,
    shareUrl: host ? shareUrl : null,
    qr: host ? qrSvg : null,
  };
}

// Prefer cloudflared (no visitor interstitial); use localtunnel only if forced.
// cloudflared's binary is provided by the `cloudflared` npm package on demand, so
// no manual install is needed — 'auto' falls back to localtunnel only if it fails.
function pickBackend(): 'cloudflared' | 'localtunnel' {
  return config.TUNNEL_BACKEND === 'localtunnel' ? 'localtunnel' : 'cloudflared';
}

// A cloudflared binary path: a system one on PATH (no download), else the
// `cloudflared` npm package's managed binary, fetched once on first use.
async function resolveCloudflaredBin(): Promise<string> {
  if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error === undefined) return 'cloudflared';
  const cf = await import('cloudflared');
  const { existsSync } = await import('node:fs');
  if (!existsSync(cf.bin)) {
    log.info('fetching cloudflared (first run)…');
    await cf.install(cf.bin);
  }
  return cf.bin;
}

async function openLocaltunnel(port: number, onDied: () => void): Promise<TunnelHandle> {
  const localtunnel = (await import('localtunnel')).default;
  const t = await localtunnel({ port });
  t.on('close', onDied); // the relay can drop the tunnel on its own
  return { url: t.url, close: () => t.close() };
}

// Quick tunnel: `cloudflared tunnel --url …` prints a trycloudflare URL once it's
// up (a few seconds), then stays running; killing the child closes the tunnel.
async function openCloudflared(port: number, onDied: () => void): Promise<TunnelHandle> {
  const bin = await resolveCloudflaredBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const scan = (buf: Buffer): void => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
      if (m) finish(() => resolve({ url: m[0], close: () => child.kill() }));
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('error', (e) => finish(() => reject(e)));
    // Exit *after* we have a URL means the relay dropped; before means it failed.
    child.on('exit', () =>
      settled ? onDied() : finish(() => reject(new Error('cloudflared exited before providing a URL'))),
    );
    const timer = setTimeout(
      () =>
        finish(() => {
          child.kill();
          reject(new Error('cloudflared timed out establishing a tunnel'));
        }),
      30_000,
    );
  });
}

// Open a tunnel to `port` (no-op if one is already open). Returns the trusted info.
export async function openTunnel(port: number): Promise<TunnelInfo> {
  if (current) return tunnelInfo(true);
  let which = pickBackend();
  let handle: TunnelHandle;
  const onDied = (): void => {
    if (current === handle) {
      current = null;
      backend = null;
      shareUrl = null;
      qrSvg = null;
      log.info('tunnel closed');
    }
  };
  try {
    handle =
      which === 'cloudflared' ? await openCloudflared(port, onDied) : await openLocaltunnel(port, onDied);
  } catch (e) {
    // 'auto' silently falls back to localtunnel; an explicit choice fails loudly.
    if (which !== 'cloudflared' || config.TUNNEL_BACKEND !== 'auto') throw e;
    log.warn(`cloudflared unavailable (${(e as Error).message}) — using localtunnel`);
    which = 'localtunnel';
    handle = await openLocaltunnel(port, onDied);
  }
  current = handle;
  backend = which;
  shareUrl = config.TUNNEL_CONTROL ? `${handle.url}?k=${config.CONTROL_TOKEN}` : handle.url;
  const qr = await import('qrcode');
  qrSvg = await qr.toString(shareUrl, { type: 'svg', margin: 1 });
  return tunnelInfo(true);
}

// Close the active tunnel, if any. Returns whether one was closed.
export function stopTunnel(): boolean {
  if (!current) return false;
  const t = current;
  current = null;
  backend = null;
  shareUrl = null;
  qrSvg = null;
  try {
    t.close();
  } catch {
    /* already gone — nothing to do */
  }
  return true;
}
