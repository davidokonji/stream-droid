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
  // Sensitive in control mode (they embed the token) — only returned to trusted
  // (local operator / token-bearing) callers; null otherwise. See tunnelInfo(trusted).
  shareUrl: string | null;
  qr: string | null;
}

// `trusted` gates the token-bearing fields: in --tunnel-control mode shareUrl/qr
// embed the control token, so a view-only viewer polling /api/state must not get
// them (they could decode the QR to escalate). The base url/control flag are safe.
export function tunnelInfo(trusted: boolean): TunnelInfo {
  return {
    active: current !== null,
    url: current?.url ?? null,
    control: config.TUNNEL_CONTROL,
    backend,
    shareUrl: trusted ? shareUrl : null,
    qr: trusted ? qrSvg : null,
  };
}

function hasCloudflared(): boolean {
  return spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error === undefined;
}

// Resolve the relay to use: an explicit choice, else cloudflared when installed.
function pickBackend(): 'cloudflared' | 'localtunnel' {
  const pref = config.TUNNEL_BACKEND;
  if (pref === 'cloudflared' || pref === 'localtunnel') return pref;
  return hasCloudflared() ? 'cloudflared' : 'localtunnel';
}

async function openLocaltunnel(port: number, onDied: () => void): Promise<TunnelHandle> {
  const localtunnel = (await import('localtunnel')).default;
  const t = await localtunnel({ port });
  t.on('close', onDied); // the relay can drop the tunnel on its own
  return { url: t.url, close: () => t.close() };
}

// Quick tunnel: `cloudflared tunnel --url …` prints a trycloudflare URL once it's
// up (a few seconds), then stays running; killing the child closes the tunnel.
function openCloudflared(port: number, onDied: () => void): Promise<TunnelHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
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
  const which = pickBackend();
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
  handle =
    which === 'cloudflared' ? await openCloudflared(port, onDied) : await openLocaltunnel(port, onDied);
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
