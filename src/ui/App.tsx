import { useCallback, useEffect, useRef, useState } from 'react';
import { tv } from 'tailwind-variants';
import { fetchState, startAvd, stopEmulator } from './api';
import { useDeviceStream } from './useDeviceStream';
import { useKeyboard } from './useKeyboard';
import { Sidebar } from './components/Sidebar';
import { Screen } from './components/Screen';
import { NavBar } from './components/NavBar';
import { LiveDot } from './components/LiveDot';
import { Notice, type NoticeData } from './components/Notice';
import type { AvdStatus } from './types';

const layout = tv({
  slots: {
    root: 'h-screen bg-[#0b0d10] font-mono text-[13px] text-neutral-200',
    topbar: 'flex items-center gap-3 border-b border-[#1c222b] p-3 md:hidden',
    burger: 'cursor-pointer text-xl leading-none opacity-80 hover:opacity-100',
    backdrop: 'fixed inset-0 z-20 bg-black/50 md:hidden',
    drawer:
      'fixed inset-y-0 left-0 z-30 w-64 transform bg-[#0b0d10] transition-transform md:static md:z-auto md:w-auto md:translate-x-0',
    main: 'flex min-w-0 flex-col items-center justify-center gap-2.5 p-3.5',
    hint: 'text-[12px] opacity-45',
    status: 'flex min-h-[1.2em] items-center gap-2 opacity-55',
  },
  variants: {
    open: { true: { drawer: 'translate-x-0' }, false: { drawer: '-translate-x-full' } },
    sidebar: { true: { root: 'md:grid md:grid-cols-[240px_1fr]' } },
  },
});

const BOOT_GIVE_UP_MS = 120_000;

export function App() {
  const { videoRef, canvasRef, codec, status, state, serial, live, controllable, connect, disconnect, send } =
    useDeviceStream();
  const [avds, setAvds] = useState<AvdStatus[]>([]);
  const [headless, setHeadless] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState<Set<string>>(new Set());

  const stoppingSince = useRef<Map<string, number>>(new Map());

  const autoStream = useRef<string | null>(null);
  const bootingSince = useRef<Map<string, number>>(new Map());
  const [notice, setNotice] = useState<NoticeData | null>(null);

  useKeyboard(send, controllable);

  useEffect(() => {
    const name = live ? (avds.find((a) => a.serial === serial)?.name ?? serial) : null;
    document.title = name ? `● ${name} · streaming` : 'stream-droid';
  }, [serial, live, avds]);

  const startBoot = useCallback(
    async (avd: string, opts: { cold?: boolean } = {}): Promise<void> => {
      autoStream.current = avd; // stream it as soon as it finishes booting
      bootingSince.current.set(avd, Date.now());
      setBooting((b) => new Set(b).add(avd));
      try {
        await startAvd(avd, headless, opts.cold);
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
    [headless],
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
    const active = avds.find((a) => a.serial === serial);
    if (active?.headless) await killDevice(serial, active.name);
    else {
      setNotice(null);
      disconnect();
    }
  };

  const shutdownActive = async (): Promise<void> => {
    if (!serial) return;
    const active = avds.find((a) => a.serial === serial);
    await killDevice(serial, active?.name ?? serial);
  };

  const settled = live && booting.size === 0;
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const st = await fetchState();
        if (!alive) return;
        setAvds(st.avds);
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
        ? 'or start another from the sidebar'
        : 'No AVDs found — install the Android SDK emulator',
    startLabel: startable ? `Start ${startable.name}` : undefined,
    onStart:
      !busy && startable
        ? () =>
            void startBoot(startable.name).catch((e: unknown) =>
              setNotice({ message: (e as Error).message, tone: 'error' }),
            )
        : undefined,
  };

  const s = layout({ open: menuOpen, sidebar: controllable });
  return (
    <div className={s.root()}>
      {controllable && (
        <header className={s.topbar()}>
          <button className={s.burger()} aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            ☰
          </button>
          <span className="flex-1 truncate opacity-70">{serial ?? 'stream-droid'}</span>
          {live && <LiveDot />}
        </header>
      )}

      {controllable && menuOpen && (
        <button className={s.backdrop()} aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}

      {controllable && (
        <div className={s.drawer()}>
          <Sidebar
            avds={avds}
            activeSerial={serial}
            liveSerial={live ? serial : null}
            booting={booting}
            stopping={stopping}
            busy={booting.size > 0}
            headless={headless}
            onHeadless={setHeadless}
            onStream={connect}
            onStart={startBoot}
            onCloseDevice={closeActive}
            onShutdownDevice={shutdownActive}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}

      <main className={s.main()}>
        {controllable && live && <div className={s.hint()}>click = tap · drag = swipe · type = keys</div>}
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
        />
        {controllable && live && <NavBar onKey={(key) => send({ type: 'key', key })} />}
        {state !== 'idle' && (
          <div className={s.status()}>
            {live && <LiveDot />}
            {status}
          </div>
        )}
        {notice && <Notice data={notice} onDismiss={() => setNotice(null)} />}
      </main>
    </div>
  );
}
