import type { State } from './types';
import { controlToken } from './token';

export async function fetchState(): Promise<State> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
  return res.json() as Promise<State>;
}

export async function startAvd(avd: string, headless: boolean): Promise<void> {
  const k = controlToken();
  const res = await fetch(`/api/start${k ? `?k=${encodeURIComponent(k)}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ avd, headless }),
  });
  const out = (await res.json()) as { ok: boolean; error?: string };
  if (!out.ok) throw new Error(out.error ?? 'failed to start emulator');
}

export async function stopEmulator(serial: string): Promise<void> {
  const k = controlToken();
  const res = await fetch(`/api/stop${k ? `?k=${encodeURIComponent(k)}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serial }),
  });
  const out = (await res.json()) as { ok: boolean; error?: string };
  if (!out.ok) throw new Error(out.error ?? 'failed to stop emulator');
}
