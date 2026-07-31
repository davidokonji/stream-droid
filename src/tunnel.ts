import { spawn, spawnSync } from 'node:child_process';
import { config, ensureControlToken } from './config.ts';
import { logger } from './log.ts';

const log = logger('tunnel');

interface TunnelHandle {
  url: string;
  close(): void;
}

let current: TunnelHandle | null = null;
let backend: string | null = null;
let controlMode = false; // whether this tunnel's shared link carries the control token
let shareUrl: string | null = null; // carries ?k= in control mode
let qrSvg: string | null = null;
let qrPng: Buffer | null = null;

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
    active: current !== null && shareUrl !== null,
    url: current?.url ?? null,
    control: controlMode,
    backend,
    host,
    shareUrl: host ? shareUrl : null,
    qr: host ? qrSvg : null,
  };
}

export function ogQr(): { png: Buffer; baseUrl: string } | null {
  if (!qrPng || !current) return null;
  return { png: qrPng, baseUrl: current.url };
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
  const t = await localtunnel({ port, local_host: '127.0.0.1' });
  const handle: TunnelHandle = { url: t.url, close: () => t.close() };
  t.on('close', () => onDied(handle));
  return handle;
}

async function openCloudflared(port: number, onDied: OnDied): Promise<TunnelHandle> {
  const bin = await resolveCloudflaredBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
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

// Poll the public URL until the relay actually routes to us. cloudflared prints
// the URL (and registers) before the edge hostname is reachable, so we'd hand out
// a link that fails for a few seconds. A 5xx is the relay's "tunnel not up" error;
// any response from our own server (< 500) means routing is live. Best-effort with
// a cap — better to return a maybe-warming link than to hang.
async function waitReachable(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop -- deliberate: probe sequentially until reachable
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(4000) });
      if (res.status < 500) return; // our server answered → the edge is routing
    } catch {
      /* DNS/connect not ready yet — retry */
    }
    // eslint-disable-next-line no-await-in-loop -- deliberate: wait between probes
    await new Promise((r) => setTimeout(r, 1200));
  }
}

// Open a tunnel to `port` (no-op if one is already open). `control` decides
// whether the shared link hands out the control token. Returns the trusted info.
export async function openTunnel(port: number, control: boolean): Promise<TunnelInfo> {
  if (current) return tunnelInfo(true);
  // Mint a control token before the relay is reachable, so a view-only share
  // (link without the token) genuinely can't control, start/stop, or reshare.
  ensureControlToken();
  let which = pickBackend();
  let handle: TunnelHandle;
  const onDied: OnDied = (h) => {
    if (h && current === h) {
      current = null;
      backend = null;
      controlMode = false;
      shareUrl = null;
      qrSvg = null;
      qrPng = null;
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
  await waitReachable(handle.url); // don't report the share ready until the link actually works
  controlMode = control;
  shareUrl = control ? `${handle.url}?k=${config.CONTROL_TOKEN}` : handle.url;
  const qr = await import('qrcode');
  qrSvg = await qr.toString(shareUrl, { type: 'svg', margin: 1 });
  qrPng = await qr.toBuffer(shareUrl, { type: 'png', width: 600, margin: 2 });
  return tunnelInfo(true);
}

// Close the active tunnel, if any. Returns whether one was closed.
export function stopTunnel(): boolean {
  if (!current) return false;
  const t = current;
  current = null;
  backend = null;
  controlMode = false;
  shareUrl = null;
  qrSvg = null;
  qrPng = null;
  try {
    t.close();
  } catch (e) {
    log.warn(`tunnel may not have fully torn down: ${(e as Error).message}`);
  }
  return true;
}
