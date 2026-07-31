import { useCallback, useEffect, useRef, useState } from 'react';
import { tv } from 'tailwind-variants';
import { fetchState, startAvd, startSharing, stopEmulator, stopSharing } from './api';
import { useDeviceStream } from './useDeviceStream';
import { useKeyboard } from './useKeyboard';
import { AppBar } from './components/AppBar';
import { Sidebar } from './components/Sidebar';
import { Screen } from './components/Screen';
import { DeviceToolbar } from './components/DeviceToolbar';
import { Notice, type NoticeData } from './components/Notice';
import type { AvdStatus, TunnelInfo } from './types';

const layout = tv({
  slots: {
    root: 'app-bg flex h-[100dvh] flex-col font-mono text-[13px] text-neutral-100',
    body: 'relative flex min-h-0 flex-1 md:gap-4 md:p-4',
    backdrop: 'fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden',
    drawer:
      'fixed inset-y-3 left-3 z-30 w-64 transform transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:static md:inset-auto md:z-auto md:w-[258px] md:shrink-0 md:translate-x-0',
    main: 'flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-4 md:p-0',
    stageWrap: 'flex items-center gap-3',
    toast: 'fixed left-1/2 top-[68px] z-40 w-[min(28rem,92vw)] -translate-x-1/2',
  },
  variants: {
    open: { true: { drawer: 'translate-x-0' }, false: { drawer: '-translate-x-[120%]' } },
  },
});

const BOOT_GIVE_UP_MS = 120_000;

export function App() {
  const {
    videoRef,
    canvasRef,
    codec,
    status,
    state,
    serial,
    live,
    controllable,
    connect,
    disconnect,
    send,
    canCopy,
    readDeviceClipboard,
  } = useDeviceStream();
  const [avds, setAvds] = useState<AvdStatus[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [capture, setCapture] = useState('');
  const [host, setHost] = useState(true);
  const [stageFocused, setStageFocused] = useState(false);
  const [coach, setCoach] = useState(false); // shown on demand via the device toolbar's "?"

  const stoppingSince = useRef<Map<string, number>>(new Map());
  const autoStopShare = useRef(false); // guards one auto-stop when the last device goes

  const autoStream = useRef<string | null>(null);
  const bootingSince = useRef<Map<string, number>>(new Map());
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);

  useKeyboard(send, controllable && stageFocused, canCopy, readDeviceClipboard);

  const dismissCoach = (): void => setCoach(false);

  // Start sharing (open a public tunnel), view-only or control-enabled.
  const startShare = async (control: boolean): Promise<void> => {
    try {
      setTunnel(await startSharing(control));
    } catch (e) {
      setNotice({ message: `Couldn't start sharing: ${(e as Error).message}`, tone: 'error' });
    }
  };

  // Stop sharing (close the public tunnel) without killing the server.
  const stopShare = async (): Promise<void> => {
    try {
      await stopSharing();
      setTunnel((t) => (t ? { ...t, active: false, url: null } : t));
    } catch (e) {
      setNotice({ message: `Couldn't stop sharing: ${(e as Error).message}`, tone: 'error' });
    }
  };

  const activeAvd = serial ? avds.find((a) => a.serial === serial) : undefined;
  const activeName = serial ? (activeAvd?.name ?? serial) : null;
  const meta = live ? status.split(' · ').slice(1).join(' · ') || null : null;

  const connected = state === 'live' || state === 'connecting';

  const defaultHeadless = !avds.some((a) => a.running && a.emulator && !a.headless);

  const anyRunning = avds.some((a) => a.running);

  useEffect(() => {
    document.title = live && activeName ? `● ${activeName} · streaming` : 'stream-droid';
  }, [live, activeName]);

  const startBoot = useCallback(
    async (avd: string, opts: { cold?: boolean; headless?: boolean } = {}): Promise<void> => {
      autoStream.current = avd; // stream it as soon as it finishes booting
      bootingSince.current.set(avd, Date.now());
      setBooting((b) => new Set(b).add(avd));
      try {
        await startAvd(avd, opts.headless ?? false, opts.cold);
      } catch (e) {
        autoStream.current = null;
        bootingSince.current.delete(avd);
        setBooting((b) => {
          const n = new Set(b);
          n.delete(avd);
          return n;
        });
        throw e;
      }
    },
    [],
  );

  const startBootNotify = useCallback(
    (avd: string, opts: { cold?: boolean; headless?: boolean }): Promise<void> =>
      startBoot(avd, opts).catch((e: unknown) => setNotice({ message: (e as Error).message, tone: 'error' })),
    [startBoot],
  );

  const killDevice = async (dev: string, name: string): Promise<void> => {
    setNotice(null);
    stoppingSince.current.set(name, Date.now());
    setStopping((s) => new Set(s).add(name));
    disconnect();
    try {
      await stopEmulator(dev);
    } catch (e) {
      stoppingSince.current.delete(name);
      setStopping((s) => {
        const n = new Set(s);
        n.delete(name);
        return n;
      });
      setNotice({ message: `Couldn't stop ${name}: ${(e as Error).message}`, tone: 'error' });
    }
  };

  const closeActive = async (): Promise<void> => {
    if (!serial) return;
    if (activeAvd?.headless) await killDevice(serial, activeAvd.name);
    else {
      setNotice(null);
      disconnect();
    }
  };

  const shutdownActive = async (): Promise<void> => {
    if (!serial) return;
    await killDevice(serial, activeAvd?.name ?? serial);
  };

  const settled = live && booting.size === 0;
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const st = await fetchState();
        if (!alive) return;
        setAvds(st.avds);
        setTunnel(st.tunnel ?? null);
        setCapture(st.capture);
        setHost(st.host);

        if (st.tunnel?.active && st.tunnel.host && !st.avds.some((a) => a.running)) {
          if (!autoStopShare.current) {
            autoStopShare.current = true;
            setTunnel((t) => (t ? { ...t, active: false, url: null } : t));
            void stopSharing().catch(() => {
              /* best-effort; the next poll retries */
            });
          }
        } else {
          autoStopShare.current = false;
        }
        const nowMs = Date.now();
        const pending = [...bootingSince.current.keys()];
        const statusOf = (n: string): AvdStatus | undefined => st.avds.find((a) => a.name === n);
        const online = pending.filter((n) => statusOf(n)?.running);

        const failed = pending.filter((n) => !online.includes(n) && statusOf(n)?.bootError);
        const timedOut = pending.filter(
          (n) =>
            !online.includes(n) &&
            !failed.includes(n) &&
            nowMs - (bootingSince.current.get(n) ?? nowMs) > BOOT_GIVE_UP_MS,
        );
        const cleared = [...online, ...failed, ...timedOut];
        for (const n of cleared) bootingSince.current.delete(n);
        if (cleared.length) {
          setBooting((b) => {
            if (b.size === 0) return b;
            const n = new Set(b);
            for (const nm of cleared) n.delete(nm);
            return n.size === b.size ? b : n;
          });
        }
        if (failed.length) {
          const one = failed.length === 1 ? failed[0]! : null;
          const detail = failed.map((n) => `${n}: ${statusOf(n)?.bootError ?? 'unknown error'}`).join('; ');
          if (autoStream.current && failed.includes(autoStream.current)) autoStream.current = null;
          setNotice({
            message: `Boot failed — ${detail}`,
            tone: 'error',
            retryLabel: one ? `Cold-boot ${one}` : undefined,
            onRetry: one
              ? () => {
                  setNotice(null);
                  void startBoot(one, { cold: true }).catch((e: unknown) =>
                    setNotice({ message: (e as Error).message, tone: 'error' }),
                  );
                }
              : undefined,
          });
        }
        if (timedOut.length) {
          // Don't let a late boot silently grab focus later; the user can retry.
          if (autoStream.current && timedOut.includes(autoStream.current)) autoStream.current = null;
          const names = timedOut.join(', ');
          const one = timedOut.length === 1 ? timedOut[0]! : null;
          setNotice({
            message: `${names} didn't come online in time. A common cause is a corrupt saved snapshot — a cold boot skips it (slower, but usually recovers it).`,
            tone: 'warn',
            retryLabel: one ? `Cold-boot ${one}` : undefined,
            onRetry: one
              ? () => {
                  setNotice(null);
                  void startBoot(one, { cold: true }).catch((e: unknown) =>
                    setNotice({ message: (e as Error).message, tone: 'error' }),
                  );
                }
              : undefined,
          });
        }

        setStopping((s) => {
          if (s.size === 0) return s;
          const now = Date.now();
          const n = new Set(s);
          for (const a of st.avds) {
            if (a.running) continue;
            if (now - (stoppingSince.current.get(a.name) ?? 0) < 2500) continue;
            n.delete(a.name);
            stoppingSince.current.delete(a.name);
          }
          return n.size === s.size ? s : n;
        });

        if (serial && !st.devices.some((d) => d.serial === serial)) disconnect();

        const wanted = autoStream.current;
        const booted = wanted && st.avds.find((a) => a.name === wanted && a.running && a.serial);
        const t = st.target?.toLowerCase();
        const preferred =
          (t
            ? st.devices.find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)
            : undefined) ?? st.devices[0];
        if (booted && booted.serial) {
          autoStream.current = null;
          connect(booted.serial);
        } else if (!serial && preferred) {
          connect(preferred.serial);
        }
      } catch {
        /* transient; next tick retries */
      }
    };
    void tick();
    const id = setInterval(tick, settled ? 10000 : 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connect, disconnect, serial, settled, startBoot]);

  const busy = booting.size > 0;
  const bootingName = [...booting][0];
  const startable = avds.find((a) => !a.running && !booting.has(a.name));
  const empty = {
    busy,
    title: busy && bootingName ? `Booting ${bootingName}…` : 'No device streaming',
    hint: busy
      ? 'This can take 20–60s'
      : avds.length
        ? 'Pick a device from the left, or start one below'
        : 'Add a device from the panel on the left',
    startLabel: startable ? `Start ${startable.name}` : undefined,
    onStart:
      !busy && startable
        ? () =>
            void startBoot(startable.name).catch((e: unknown) =>
              setNotice({ message: (e as Error).message, tone: 'error' }),
            )
        : undefined,
  };

  const sendKey = (key: string): void => send({ type: 'key', key });
  const showToolbar = controllable && live;
  const s = layout({ open: menuOpen });

  return (
    <div className={s.root()}>
      <AppBar
        onMenu={() => setMenuOpen(true)}
        hasSidebar={host}
        activeName={connected ? activeName : null}
        live={live}
        meta={meta}
        capture={capture}
        anyRunning={anyRunning}
        tunnel={tunnel}
        onStartShare={startShare}
        onStopShare={stopShare}
      />

      <div className={s.body()}>
        {host && menuOpen && (
          <button className={s.backdrop()} aria-label="Close devices" onClick={() => setMenuOpen(false)} />
        )}

        {host && (
          <div className={s.drawer()}>
            <Sidebar
              avds={avds}
              activeSerial={serial}
              liveSerial={live ? serial : null}
              booting={booting}
              stopping={stopping}
              busy={busy}
              onStream={connect}
              onStart={startBootNotify}
              onCloseDevice={closeActive}
              onShutdownDevice={shutdownActive}
              defaultHeadless={defaultHeadless}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        )}

        <main className={s.main()}>
          <div className={s.stageWrap()}>
            <Screen
              videoRef={videoRef}
              canvasRef={canvasRef}
              codec={codec}
              live={live}
              state={state}
              status={status}
              empty={empty}
              controllable={controllable}
              onControl={send}
              onFocusChange={setStageFocused}
              focused={stageFocused}
              coach={coach}
              onDismissCoach={dismissCoach}
            />
            {showToolbar && (
              <div className="hidden md:block">
                <DeviceToolbar orientation="vertical" onKey={sendKey} onHelp={() => setCoach(true)} />
              </div>
            )}
          </div>
          {showToolbar && (
            <div className="md:hidden">
              <DeviceToolbar orientation="horizontal" onKey={sendKey} onHelp={() => setCoach(true)} />
            </div>
          )}
        </main>
      </div>

      {notice && (
        <div className={s.toast()}>
          <Notice data={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}
    </div>
  );
}
