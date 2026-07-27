// Tunnel lifecycle: open a share, stop it without killing the server, and report
// its state. Two backends — cloudflared (default; no visitor interstitial, binary
// via the `cloudflared` npm package) and localtunnel (fallback) — loaded lazily.

import { spawn, spawnSync } from 'node:child_process';
import { config } from './config.ts';
import { logger } from './log.ts';

const log = logger('tunnel');

interface TunnelHandle {
  url: string;
  close(): void;
}

let current: TunnelHandle | null = null;
let backend: string | null = null;
let shareUrl: string | null = null; // carries ?k= in control mode
let qrSvg: string | null = null;

export interface TunnelInfo {
  active: boolean;
  url: string | null; // public base URL (view-only); safe to expose to anyone
  control: boolean;
  backend: string | null;
  host: boolean;
  // shareUrl/qr embed the control token, so tunnelInfo returns them only to the
  // host (local operator) — never to a recipient of the shared link.
  shareUrl: string | null;
  qr: string | null;
}

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

// Prefer cloudflared unless localtunnel is forced; 'auto' falls back on failure.
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

type OnDied = (h: TunnelHandle | undefined) => void;

async function openLocaltunnel(port: number, onDied: OnDied): Promise<TunnelHandle> {
  const localtunnel = (await import('localtunnel')).default;
  const t = await localtunnel({ port });
  const handle: TunnelHandle = { url: t.url, close: () => t.close() };
  t.on('close', () => onDied(handle));
  return handle;
}

// Quick tunnel: `cloudflared tunnel --url …` prints a trycloudflare URL once it's
// up, then stays running; killing the child closes it.
async function openCloudflared(port: number, onDied: OnDied): Promise<TunnelHandle> {
  const bin = await resolveCloudflaredBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let handle: TunnelHandle | undefined;
    let settled = false;
    let out = '';
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const scan = (buf: Buffer): void => {
      out = (out + buf).slice(-4096); // keep the tail so a URL split across chunks still matches
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(out);
      if (m) finish(() => resolve((handle = { url: m[0], close: () => child.kill() })));
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('error', (e) => finish(() => reject(e)));
    child.on('exit', () =>
      settled ? onDied(handle) : finish(() => reject(new Error('cloudflared exited before providing a URL'))),
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
  const onDied: OnDied = (h) => {
    if (h && current === h) {
      current = null;
      backend = null;
      shareUrl = null;
      qrSvg = null;
      console.log('[stream-droid] tunnel closed (the relay dropped the connection)');
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
  } catch (e) {
    log.warn(`tunnel may not have fully torn down: ${(e as Error).message}`);
  }
  return true;
}
