import { useEffect, useState } from 'react';
import { tv } from 'tailwind-variants';
import { fetchState, startAvd, stopEmulator } from './api';
import { useDeviceStream } from './useDeviceStream';
import { useKeyboard } from './useKeyboard';
import { Sidebar } from './components/Sidebar';
import { Screen } from './components/Screen';
import { NavBar } from './components/NavBar';
import { LiveDot } from './components/LiveDot';
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
    notice: 'text-[12px] text-amber-300',
  },
  variants: {
    open: { true: { drawer: 'translate-x-0' }, false: { drawer: '-translate-x-full' } },
    // View-only sessions hide the sidebar, so the grid column isn't reserved.
    sidebar: { true: { root: 'md:grid md:grid-cols-[240px_1fr]' } },
  },
});

export function App() {
  const { videoRef, canvasRef, codec, status, state, serial, live, controllable, connect, disconnect, send } =
    useDeviceStream();
  const [avds, setAvds] = useState<AvdStatus[]>([]);
  const [headless, setHeadless] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [booting, setBooting] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useKeyboard(send, controllable);

  // Reflect the device in the tab title only while it's actually streaming; idle,
  // connecting, and disconnected all fall back to the plain app name.
  useEffect(() => {
    const name = live ? (avds.find((a) => a.serial === serial)?.name ?? serial) : null;
    document.title = name ? `● ${name} · streaming` : 'stream-droid';
  }, [serial, live, avds]);

  const startBoot = async (avd: string): Promise<void> => {
    setBooting((b) => new Set(b).add(avd));
    try {
      await startAvd(avd, headless);
    } catch (e) {
      setBooting((b) => {
        const n = new Set(b);
        n.delete(avd);
        return n;
      });
      throw e;
    }
  };

  // Close the streamed device. Headless emulators (no window) are shut down
  // entirely — whether this session booted them or not, from the server's live
  // `headless` state; a windowed emulator just detaches (it keeps running).
  const closeActive = async (): Promise<void> => {
    if (!serial) return;
    setNotice(null);
    const active = avds.find((a) => a.serial === serial);
    disconnect();
    if (active?.headless) {
      try {
        await stopEmulator(serial);
      } catch (e) {
        setNotice(`couldn't stop ${active.name}: ${(e as Error).message}`);
      }
    }
  };

  // Slow the poll once a stream is live and nothing's booting; the WS reports
  // disconnects, so there's no need to hit adb every 3 s.
  const settled = live && booting.size === 0;
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const st = await fetchState();
        if (!alive) return;
        setAvds(st.avds);
        setBooting((b) => {
          if (b.size === 0) return b;
          const n = new Set(b);
          for (const a of st.avds) if (a.running) n.delete(a.name);
          return n.size === b.size ? b : n;
        });
        // The streamed device vanished (emulator closed) — tear the stream down so
        // the UI shows "disconnected" instead of a frozen frame, without a reload.
        if (serial && !st.devices.some((d) => d.serial === serial)) disconnect();
        const t = st.target?.toLowerCase();
        const preferred =
          (t
            ? st.devices.find((d) => d.serial.toLowerCase() === t || d.avd.toLowerCase() === t)
            : undefined) ?? st.devices[0];
        if (!serial && preferred) connect(preferred.serial);
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
  }, [connect, disconnect, serial, settled]);

  // Actionable idle empty state: offer a one-click boot of the first stopped AVD,
  // reflect an in-progress boot, and guide when there are no AVDs at all.
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
        ? () => void startBoot(startable.name).catch((e: unknown) => setNotice((e as Error).message))
        : undefined,
  };

  const s = layout({ open: menuOpen, sidebar: controllable });
  return (
    <div className={s.root()}>
      {/* View-only sessions (a shared tunnel link without the control token) show
          only the preview — the sidebar and its ☰ toggle are hidden, since booting
          or switching devices is control the viewer doesn't have. */}
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
            busy={booting.size > 0}
            headless={headless}
            onHeadless={setHeadless}
            onStream={connect}
            onStart={startBoot}
            onCloseDevice={closeActive}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      )}

      <main className={s.main()}>
        {/* The interaction hint + nav bar only make sense with a live device to
            drive — hide them while idle/connecting/disconnected. */}
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
        {/* Status line: serial · WxH · codec when live, connecting/disconnected notes
            otherwise. Idle is covered by the empty state, so skip the redundant line. */}
        {state !== 'idle' && (
          <div className={s.status()}>
            {live && <LiveDot />}
            {status}
          </div>
        )}
        {notice && <div className={s.notice()}>{notice}</div>}
      </main>
    </div>
  );
}
